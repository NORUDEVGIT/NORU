/**
 * Guest Profile Wave 5 — activity hub + privacy finish.
 *
 * Extends the existing guests stack (`requireGuestManager` / guest tables).
 * Not a second guest master. Not a marketing cloud.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  recordGuestAccountEvent,
  recordGuestEvent,
  requireGuestManager,
  requireGuestPrivacyOfficer,
} from "./guests.server";
import { isMissingSchemaError } from "./pms-set2-structure";
import { parseNotificationChannels } from "./pms-set5-depts-guestsvc";
import {
  GUEST_ACCOUNT_TYPE_LABELS,
  type GuestAccountType,
} from "./guest-profile-wave4";
import {
  GUEST_COMMS_CHANNELS,
  WAVE5_ANONYMISED_GUEST_LABEL,
  WAVE5_ANONYMISED_MASTER_LABELS,
  WAVE5_MIGRATION_UNAVAILABLE,
  WAVE5_UNMERGE_BLOCKED_MOVED,
  WAVE5_UNMERGE_BLOCKED_NO_LEDGER,
  platformEmailTransportConfigured,
  propertyEmailChannelConfigured,
  resolveGuestSendChannel,
  type GuestMergeLedgerPayload,
  type GuestSendChannel,
  type UnmergeAssessment,
} from "./guest-profile-wave5";

const idSchema = z.string().uuid();

function db(client: { from: (table: string) => unknown }) {
  return client as unknown as { from: (table: string) => any };
}

function wave5Unavailable(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (isMissingSchemaError(error)) return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("guest_merge_ledger") || msg.includes("anonymised_at") || msg.includes("comms_logged");
}

function wave5Error(error: { message?: string; code?: string } | null | undefined): Error {
  if (wave5Unavailable(error)) return new Error(WAVE5_MIGRATION_UNAVAILABLE);
  return new Error(error?.message ?? WAVE5_MIGRATION_UNAVAILABLE);
}

export type GuestActivityEntry = {
  id: string;
  source: "note" | "history" | "comms";
  eventType: string;
  notes: string | null;
  actorName: string | null;
  createdAt: string;
};

export type GuestActivityHub = {
  notes: string | null;
  entries: GuestActivityEntry[];
  sendChannel: GuestSendChannel | null;
  anonymised: boolean;
};

export type GuestPrivacyAuditEntry = {
  id: string;
  eventType: string;
  notes: string | null;
  actorName: string | null;
  createdAt: string;
};

export type GuestHeldExport = {
  filename: string;
  jsonText: string;
};

export type GuestUnmergeCandidate = {
  retiredId: string;
  retiredName: string;
  assessment: UnmergeAssessment;
};

async function resolveActorNames(
  restaurantId: string,
  membershipIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const actorNames = new Map<string, string>();
  const actorIds = Array.from(new Set(membershipIds.filter(Boolean) as string[]));
  if (actorIds.length === 0) return actorNames;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: members } = await supabaseAdmin
    .from("restaurant_users")
    .select("id, user_id")
    .eq("restaurant_id", restaurantId)
    .in("id", actorIds);
  const userIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = userIds.length
    ? await supabaseAdmin.from("profiles").select("id, first_name, last_name, email").in("id", userIds)
    : { data: [] as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }> };
  const byUser = new Map((profiles ?? []).map((p) => [p.id, p]));
  for (const m of members ?? []) {
    const p = byUser.get(m.user_id);
    const name = p
      ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || (p.email ?? "")
      : "";
    actorNames.set(m.id, name || "Staff member");
  }
  return actorNames;
}

async function loadSendChannel(restaurantId: string): Promise<GuestSendChannel | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select("pms_notification_channels")
    .eq("id", restaurantId)
    .maybeSingle();
  if (error && isMissingSchemaError(error)) {
    return resolveGuestSendChannel({
      platformTransport: platformEmailTransportConfigured(),
      propertyEmail: false,
    });
  }
  if (error) throw new Error(error.message);
  const channels = parseNotificationChannels(data?.pms_notification_channels);
  return resolveGuestSendChannel({
    platformTransport: platformEmailTransportConfigured(),
    propertyEmail: propertyEmailChannelConfigured(channels),
  });
}

async function sendOperationalEmail(to: string, subject: string, text: string): Promise<void> {
  const apiKey = process.env["RESEND_API_KEY"]?.trim();
  const from = process.env["GUEST_EMAIL_FROM"]?.trim() || process.env["RECEIPT_EMAIL_FROM"]?.trim();
  if (!apiKey || !from) throw new Error("Email is not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!response.ok) {
    const body = await response.text();
    console.error("[sendGuestOperationalEmail]", response.status, body);
    throw new Error("The email could not be sent.");
  }
}

function hubSource(eventType: string): GuestActivityEntry["source"] {
  if (eventType === "note_added") return "note";
  if (eventType === "comms_logged" || eventType === "comms_sent") return "comms";
  return "history";
}

export const getGuestActivityHub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestActivityHub> => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const guestRes = await db(supabaseAdmin)
      .from("guest_profiles")
      .select("id, notes, anonymised_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (guestRes.error && isMissingSchemaError(guestRes.error)) {
      const fallback = await supabaseAdmin
        .from("guest_profiles")
        .select("id, notes")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.guestId)
        .maybeSingle();
      if (fallback.error) throw new Error(fallback.error.message);
      if (!fallback.data) throw new Error("That guest could not be found.");
      const history = await supabaseAdmin
        .from("guest_profile_history")
        .select("id, event_type, notes, actor_membership_id, created_at")
        .eq("restaurant_id", data.restaurantId)
        .eq("guest_id", data.guestId)
        .order("created_at", { ascending: false })
        .limit(100);
      const actorNames = await resolveActorNames(
        data.restaurantId,
        (history.data ?? []).map((row) => row.actor_membership_id),
      );
      return {
        notes: fallback.data.notes ?? null,
        entries: ((history.data ?? []) as Array<{
          id: string;
          event_type: string;
          notes: string | null;
          actor_membership_id: string | null;
          created_at: string;
        }>).map((row) => ({
          id: row.id,
          source: hubSource(row.event_type),
          eventType: row.event_type,
          notes: row.notes,
          actorName: row.actor_membership_id ? (actorNames.get(row.actor_membership_id) ?? null) : null,
          createdAt: row.created_at,
        })),
        sendChannel: await loadSendChannel(data.restaurantId),
        anonymised: false,
      };
    }
    if (guestRes.error) throw new Error(guestRes.error.message);
    if (!guestRes.data) throw new Error("That guest could not be found.");

    const history = await supabaseAdmin
      .from("guest_profile_history")
      .select("id, event_type, notes, actor_membership_id, created_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (history.error) throw new Error(history.error.message);
    const actorNames = await resolveActorNames(
      data.restaurantId,
      (history.data ?? []).map((row) => row.actor_membership_id),
    );
    return {
      notes: guestRes.data.notes ?? null,
      entries: ((history.data ?? []) as Array<{
        id: string;
        event_type: string;
        notes: string | null;
        actor_membership_id: string | null;
        created_at: string;
      }>).map((row) => ({
        id: row.id,
        source: hubSource(row.event_type),
        eventType: row.event_type,
        notes: row.notes,
        actorName: row.actor_membership_id ? (actorNames.get(row.actor_membership_id) ?? null) : null,
        createdAt: row.created_at,
      })),
      sendChannel: await loadSendChannel(data.restaurantId),
      anonymised: Boolean(guestRes.data.anonymised_at),
    };
  });

export const getGuestAccountActivityHub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, accountId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestActivityHub> => {
    await requireGuestManager(context as never, data.restaurantId);
    const client = db(context.supabase);
    const account = await client
      .from("guest_account_masters")
      .select("id, notes, anonymised_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.accountId)
      .maybeSingle();
    if (wave5Unavailable(account.error) && account.error && isMissingSchemaError(account.error)) {
      throw new Error(WAVE5_MIGRATION_UNAVAILABLE);
    }
    if (account.error) throw wave5Error(account.error);
    if (!account.data) throw new Error("That account master could not be found.");

    const history = await client
      .from("guest_account_history")
      .select("id, event_type, notes, actor_membership_id, created_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("master_id", data.accountId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (history.error) throw wave5Error(history.error);
    const actorNames = await resolveActorNames(
      data.restaurantId,
      ((history.data ?? []) as Array<{ actor_membership_id: string | null }>).map((row) => row.actor_membership_id),
    );
    return {
      notes: account.data.notes ?? null,
      entries: ((history.data ?? []) as Array<{
        id: string;
        event_type: string;
        notes: string | null;
        actor_membership_id: string | null;
        created_at: string;
      }>).map((row) => ({
        id: row.id,
        source: hubSource(row.event_type),
        eventType: row.event_type,
        notes: row.notes,
        actorName: row.actor_membership_id ? (actorNames.get(row.actor_membership_id) ?? null) : null,
        createdAt: row.created_at,
      })),
      sendChannel: await loadSendChannel(data.restaurantId),
      anonymised: Boolean(account.data.anonymised_at),
    };
  });

export const recordGuestCommunication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        channel: z.enum(GUEST_COMMS_CHANNELS),
        notes: z.string().trim().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const guest = await db(supabaseAdmin)
      .from("guest_profiles")
      .select("id, anonymised_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (guest.error) throw wave5Error(guest.error);
    if (!guest.data) throw new Error("That guest could not be found.");
    if ((guest.data as { anonymised_at?: string | null }).anonymised_at) {
      throw new Error("This profile has been anonymised and cannot be changed.");
    }
    try {
      await recordGuestEvent({
        restaurantId: data.restaurantId,
        guestId: data.guestId,
        eventType: "comms_logged",
        newValues: { channel: data.channel },
        notes: data.notes.trim(),
        actorMembershipId: me.id,
      });
    } catch (error) {
      throw wave5Error(error as { message?: string });
    }
    return { ok: true as const };
  });

export const recordGuestAccountCommunication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        accountId: idSchema,
        channel: z.enum(GUEST_COMMS_CHANNELS),
        notes: z.string().trim().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const client = db(context.supabase);
    const account = await client
      .from("guest_account_masters")
      .select("id, anonymised_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.accountId)
      .maybeSingle();
    if (account.error) throw wave5Error(account.error);
    if (!account.data) throw new Error("That account master could not be found.");
    if (account.data.anonymised_at) {
      throw new Error("This profile has been anonymised and cannot be changed.");
    }
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.accountId,
      eventType: "comms_logged",
      newValues: { channel: data.channel },
      notes: data.notes.trim(),
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const sendGuestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        body: z.string().trim().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const channel = await loadSendChannel(data.restaurantId);
    if (!channel) throw new Error("No send channel is configured.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const guest = await db(supabaseAdmin)
      .from("guest_profiles")
      .select("id, email, first_name, last_name, anonymised_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (guest.error) throw wave5Error(guest.error);
    if (!guest.data) throw new Error("That guest could not be found.");
    if ((guest.data as { anonymised_at?: string | null }).anonymised_at) {
      throw new Error("This profile has been anonymised and cannot be changed.");
    }
    const email = (guest.data.email ?? "").trim();
    if (!email) throw new Error("This guest has no email address on file.");
    await sendOperationalEmail(
      email,
      "Message from the hotel",
      data.body.trim(),
    );
    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: data.guestId,
      eventType: "comms_sent",
      newValues: { channel: "email" },
      notes: data.body.trim(),
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const sendGuestAccountMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        accountId: idSchema,
        body: z.string().trim().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const channel = await loadSendChannel(data.restaurantId);
    if (!channel) throw new Error("No send channel is configured.");
    const client = db(context.supabase);
    const account = await client
      .from("guest_account_masters")
      .select("id, email, name, anonymised_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.accountId)
      .maybeSingle();
    if (account.error) throw wave5Error(account.error);
    if (!account.data) throw new Error("That account master could not be found.");
    if (account.data.anonymised_at) {
      throw new Error("This profile has been anonymised and cannot be changed.");
    }
    const email = String(account.data.email ?? "").trim();
    if (!email) throw new Error("This account has no email address on file.");
    await sendOperationalEmail(email, "Message from the hotel", data.body.trim());
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.accountId,
      eventType: "comms_sent",
      newValues: { channel: "email" },
      notes: data.body.trim(),
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const listGuestPrivacyAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestPrivacyAuditEntry[]> => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const history = await supabaseAdmin
      .from("guest_profile_history")
      .select("id, event_type, notes, actor_membership_id, created_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId)
      .in("event_type", ["exported", "anonymised", "unmerged", "unmerge_blocked"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (history.error) throw wave5Error(history.error);
    const actorNames = await resolveActorNames(
      data.restaurantId,
      (history.data ?? []).map((row) => row.actor_membership_id),
    );
    return ((history.data ?? []) as Array<{
      id: string;
      event_type: string;
      notes: string | null;
      actor_membership_id: string | null;
      created_at: string;
    }>).map((row) => ({
      id: row.id,
      eventType: row.event_type,
      notes: row.notes,
      actorName: row.actor_membership_id ? (actorNames.get(row.actor_membership_id) ?? null) : null,
      createdAt: row.created_at,
    }));
  });

export const listGuestAccountPrivacyAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, accountId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestPrivacyAuditEntry[]> => {
    await requireGuestManager(context as never, data.restaurantId);
    const history = await db(context.supabase)
      .from("guest_account_history")
      .select("id, event_type, notes, actor_membership_id, created_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("master_id", data.accountId)
      .in("event_type", ["exported", "anonymised"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (history.error) throw wave5Error(history.error);
    const actorNames = await resolveActorNames(
      data.restaurantId,
      ((history.data ?? []) as Array<{ actor_membership_id: string | null }>).map((row) => row.actor_membership_id),
    );
    return ((history.data ?? []) as Array<{
      id: string;
      event_type: string;
      notes: string | null;
      actor_membership_id: string | null;
      created_at: string;
    }>).map((row) => ({
      id: row.id,
      eventType: row.event_type,
      notes: row.notes,
      actorName: row.actor_membership_id ? (actorNames.get(row.actor_membership_id) ?? null) : null,
      createdAt: row.created_at,
    }));
  });

export const exportGuestProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestHeldExport> => {
    const me = await requireGuestPrivacyOfficer(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const guest = await supabaseAdmin
      .from("guest_profiles")
      .select("*")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (guest.error) throw wave5Error(guest.error);
    if (!guest.data) throw new Error("That guest could not be found.");

    const [prefs, history, documents, links, emergency] = await Promise.all([
      supabaseAdmin
        .from("guest_preferences")
        .select("*")
        .eq("restaurant_id", data.restaurantId)
        .eq("guest_id", data.guestId)
        .maybeSingle(),
      supabaseAdmin
        .from("guest_profile_history")
        .select("id, event_type, notes, created_at")
        .eq("restaurant_id", data.restaurantId)
        .eq("guest_id", data.guestId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("guest_documents")
        .select("id, kind, mime_type, size_bytes, verification_status, created_at")
        .eq("restaurant_id", data.restaurantId)
        .eq("guest_id", data.guestId),
      db(supabaseAdmin)
        .from("guest_account_links")
        .select("id, master_id, role, created_at")
        .eq("restaurant_id", data.restaurantId)
        .eq("guest_id", data.guestId),
      db(supabaseAdmin)
        .from("guest_emergency_contacts")
        .select("id, name, relationship, phone, email, sort_order")
        .eq("restaurant_id", data.restaurantId)
        .eq("guest_id", data.guestId),
    ]);

    const json = {
      exportedAt: new Date().toISOString(),
      restaurantId: data.restaurantId,
      guestId: data.guestId,
      profile: guest.data,
      preferences: prefs.data ?? null,
      history: history.data ?? [],
      documents: documents.data ?? [],
      relationships: links.data ?? [],
      emergencyContacts: emergency.error ? [] : (emergency.data ?? []),
    };
    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: data.guestId,
      eventType: "exported",
      newValues: { format: "json" },
      notes: "Individual held profile data exported.",
      actorMembershipId: me.id,
    });
    return {
      filename: `guest-${data.guestId}-export.json`,
      jsonText: JSON.stringify(json, null, 2),
    };
  });

export const exportGuestAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, accountId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestHeldExport> => {
    const me = await requireGuestPrivacyOfficer(context as never, data.restaurantId);
    const admin = db((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const account = await admin
      .from("guest_account_masters")
      .select("*")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.accountId)
      .maybeSingle();
    if (account.error) throw wave5Error(account.error);
    if (!account.data) throw new Error("That account master could not be found.");
    const [history, links] = await Promise.all([
      admin
        .from("guest_account_history")
        .select("id, event_type, notes, created_at")
        .eq("restaurant_id", data.restaurantId)
        .eq("master_id", data.accountId)
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("guest_account_links")
        .select("id, guest_id, role, created_at")
        .eq("restaurant_id", data.restaurantId)
        .eq("master_id", data.accountId),
    ]);
    const json = {
      exportedAt: new Date().toISOString(),
      restaurantId: data.restaurantId,
      accountId: data.accountId,
      master: account.data,
      history: history.data ?? [],
      relationships: links.data ?? [],
    };
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.accountId,
      eventType: "exported",
      newValues: { format: "json" },
      notes: "Master contact data exported.",
      actorMembershipId: me.id,
    });
    return {
      filename: `guest-account-${data.accountId}-export.json`,
      jsonText: JSON.stringify(json, null, 2),
    };
  });

export const anonymiseGuest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestPrivacyOfficer(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const existing = await db(supabaseAdmin)
      .from("guest_profiles")
      .select("id, anonymised_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (existing.error) throw wave5Error(existing.error);
    if (!existing.data) throw new Error("That guest could not be found.");
    if ((existing.data as { anonymised_at?: string | null }).anonymised_at) {
      throw new Error("This profile is already anonymised.");
    }

    const now = new Date().toISOString();
    const baseAnonymise = {
      first_name: WAVE5_ANONYMISED_GUEST_LABEL,
      last_name: null,
      phone: null,
      email: null,
      nationality: null,
      language: null,
      date_of_birth: null,
      address_line1: null,
      address_line2: null,
      city: null,
      region: null,
      country: null,
      postal_code: null,
      id_document_type: null,
      id_document_number: null,
      id_document_expiry: null,
      notes: null,
      linked_customer_user_id: null,
      anonymised_at: now,
      anonymised_by_membership_id: me.id,
    };
    let { error } = await db(supabaseAdmin)
      .from("guest_profiles")
      .update({
        ...baseAnonymise,
        title: null,
        middle_name: null,
        preferred_name: null,
        gender: null,
        phone_alt: null,
        email_alt: null,
        employment_position: null,
        department: null,
        source_of_business: null,
        restriction_reason: null,
      } as never)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId);
    if (error && isMissingSchemaError(error)) {
      const retry = await db(supabaseAdmin)
        .from("guest_profiles")
        .update(baseAnonymise as never)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.guestId);
      error = retry.error;
    }
    if (error) throw wave5Error(error);

    await db(supabaseAdmin)
      .from("guest_emergency_contacts")
      .delete()
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId);

    await supabaseAdmin
      .from("guest_preferences")
      .update({
        room_preference: null,
        bed_preference: null,
        floor_preference: null,
        view_preference: null,
        food_preference: null,
        communication_preference: null,
        accessibility_requirements: null,
        special_requests: null,
      } as never)
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId);

    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: data.guestId,
      eventType: "anonymised",
      newValues: { anonymised_at: now },
      notes: "Live PII removed. Stay and folio records remain linked.",
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const anonymiseGuestAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, accountId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestPrivacyOfficer(context as never, data.restaurantId);
    const admin = db((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const existing = await admin
      .from("guest_account_masters")
      .select("id, account_type, anonymised_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.accountId)
      .maybeSingle();
    if (existing.error) throw wave5Error(existing.error);
    if (!existing.data) throw new Error("That account master could not be found.");
    if (existing.data.anonymised_at) throw new Error("This profile is already anonymised.");
    const accountType = existing.data.account_type as GuestAccountType;
    const now = new Date().toISOString();
    const baseClear = {
      name: WAVE5_ANONYMISED_MASTER_LABELS[accountType] ?? `Anonymised ${GUEST_ACCOUNT_TYPE_LABELS[accountType]}`,
      email: null,
      phone: null,
      address_line1: null,
      city: null,
      country: null,
      notes: null,
      anonymised_at: now,
      anonymised_by_membership_id: me.id,
    };
    let { error } = await admin
      .from("guest_account_masters")
      .update({
        ...baseClear,
        trade_name: null,
        tax_id: null,
        business_registration_number: null,
        phone_alt: null,
        email_alt: null,
        primary_contact_name: null,
        address_line2: null,
        region: null,
        postal_code: null,
        corporate_account_reference: null,
        negotiated_rate_reference: null,
        source_of_business: null,
      })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.accountId);
    if (error && isMissingSchemaError(error)) {
      const retry = await admin
        .from("guest_account_masters")
        .update(baseClear)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.accountId);
      error = retry.error;
    }
    if (error) throw wave5Error(error);
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.accountId,
      eventType: "anonymised",
      newValues: { anonymised_at: now },
      notes: "Master contact PII removed. Relationship links remain.",
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

async function loadOpenLedger(
  restaurantId: string,
  survivorId: string,
  retiredId: string,
): Promise<{ id: string; payload: GuestMergeLedgerPayload; revertedAt: string | null } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await db(supabaseAdmin)
    .from("guest_merge_ledger")
    .select("id, payload, reverted_at")
    .eq("restaurant_id", restaurantId)
    .eq("survivor_id", survivorId)
    .eq("retired_id", retiredId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    if (wave5Unavailable(result.error)) return null;
    throw wave5Error(result.error);
  }
  if (!result.data) return null;
  return {
    id: result.data.id,
    payload: result.data.payload as GuestMergeLedgerPayload,
    revertedAt: result.data.reverted_at,
  };
}

export const listGuestUnmergeCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestUnmergeCandidate[]> => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const history = await supabaseAdmin
      .from("guest_profile_history")
      .select("new_values")
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId)
      .eq("event_type", "merged_from")
      .order("created_at", { ascending: false })
      .limit(20);
    if (history.error) throw new Error(history.error.message);

    const seen = new Set<string>();
    const candidates: GuestUnmergeCandidate[] = [];
    for (const row of history.data ?? []) {
      const values = (row.new_values ?? {}) as { retired_id?: string; retired_name?: string };
      const retiredId = values.retired_id;
      if (!retiredId || seen.has(retiredId)) continue;
      seen.add(retiredId);
      candidates.push({
        retiredId,
        retiredName: values.retired_name ?? "Merged guest",
        assessment: await assessUnmerge(data.restaurantId, data.guestId, retiredId),
      });
    }
    return candidates;
  });

async function assessUnmerge(
  restaurantId: string,
  survivorId: string,
  retiredId: string,
): Promise<UnmergeAssessment> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await db(supabaseAdmin)
      .from("guest_profiles")
      .select("id, merged_into_guest_id, anonymised_at")
    .eq("restaurant_id", restaurantId)
    .in("id", [survivorId, retiredId]);
  if (error) throw wave5Error(error);
  const survivor = ((rows ?? []) as Array<{ id: string; merged_into_guest_id?: string | null; anonymised_at?: string | null }>).find(
    (row) => row.id === survivorId,
  );
  const retired = ((rows ?? []) as Array<{ id: string; merged_into_guest_id?: string | null; anonymised_at?: string | null }>).find(
    (row) => row.id === retiredId,
  );
  if (!survivor || !retired) {
    return { status: "blocked", reason: "Both guests must belong to this property.", code: "not_merged" };
  }
  if (retired.merged_into_guest_id !== survivorId) {
    return {
      status: "blocked",
      reason: "That profile is not currently merged into this guest.",
      code: "not_merged",
    };
  }
  if (survivor.anonymised_at || retired.anonymised_at) {
    return {
      status: "blocked",
      reason: "An anonymised profile cannot be unmerged.",
      code: "anonymised",
    };
  }
  const ledger = await loadOpenLedger(restaurantId, survivorId, retiredId);
  if (!ledger) {
    return { status: "blocked", reason: WAVE5_UNMERGE_BLOCKED_NO_LEDGER, code: "no_ledger" };
  }
  if (ledger.revertedAt) {
    return { status: "blocked", reason: "This merge was already unmerged.", code: "already_reverted" };
  }
  const stillOnSurvivor = await supabaseAdmin
    .from("hotel_reservations")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .in("id", ledger.payload.movedReservationIds.length ? ledger.payload.movedReservationIds : ["00000000-0000-0000-0000-000000000000"]);
  const remaining = new Set(((stillOnSurvivor.data ?? []) as Array<{ id: string }>).map((row) => row.id));
  const movedAway = ledger.payload.movedReservationIds.filter((id) => !remaining.has(id));
  if (movedAway.length > 0) {
    return { status: "blocked", reason: WAVE5_UNMERGE_BLOCKED_MOVED, code: "moved" };
  }
  return { status: "reversible", ledgerId: ledger.id };
}

export const unmergeGuests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        survivorId: idSchema,
        retiredId: idSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestPrivacyOfficer(context as never, data.restaurantId);
    const assessment = await assessUnmerge(data.restaurantId, data.survivorId, data.retiredId);
    if (assessment.status === "blocked") {
      await recordGuestEvent({
        restaurantId: data.restaurantId,
        guestId: data.survivorId,
        eventType: "unmerge_blocked",
        newValues: { retired_id: data.retiredId, code: assessment.code },
        notes: assessment.reason,
        actorMembershipId: me.id,
      });
      await recordGuestEvent({
        restaurantId: data.restaurantId,
        guestId: data.retiredId,
        eventType: "unmerge_blocked",
        newValues: { survivor_id: data.survivorId, code: assessment.code },
        notes: assessment.reason,
        actorMembershipId: me.id,
      });
      return { ok: false as const, recorded: true as const, reason: assessment.reason };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ledger = await loadOpenLedger(data.restaurantId, data.survivorId, data.retiredId);
    if (!ledger) {
      throw new Error(WAVE5_UNMERGE_BLOCKED_NO_LEDGER);
    }
    const payload = ledger.payload;
    const admin = db(supabaseAdmin);

    if (Object.keys(payload.previousSurvivorProfile).length > 0) {
      const { error } = await supabaseAdmin
        .from("guest_profiles")
        .update(payload.previousSurvivorProfile as never)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.survivorId);
      if (error) throw new Error(error.message);
    }
    if (payload.previousSurvivorPrefs) {
      await supabaseAdmin
        .from("guest_preferences")
        .update(payload.previousSurvivorPrefs as never)
        .eq("restaurant_id", data.restaurantId)
        .eq("guest_id", data.survivorId);
    }
    if (Object.keys(payload.previousSurvivorConsent).length > 0) {
      await supabaseAdmin
        .from("guest_profiles")
        .update(payload.previousSurvivorConsent as never)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.survivorId);
    }

    if (payload.movedReservationIds.length > 0) {
      const { error } = await supabaseAdmin
        .from("hotel_reservations")
        .update({ guest_id: data.retiredId })
        .eq("restaurant_id", data.restaurantId)
        .in("id", payload.movedReservationIds);
      if (error) throw new Error(error.message);
    }
    if (payload.movedDocumentIds.length > 0) {
      await supabaseAdmin
        .from("guest_documents")
        .update({ guest_id: data.retiredId })
        .eq("restaurant_id", data.restaurantId)
        .in("id", payload.movedDocumentIds);
    }
    for (const linkId of payload.movedLinkIds) {
      await admin
        .from("guest_account_links")
        .update({ guest_id: data.retiredId })
        .eq("restaurant_id", data.restaurantId)
        .eq("id", linkId);
    }

    const { error: reviveError } = await supabaseAdmin
      .from("guest_profiles")
      .update({
        guest_status: payload.retiredStatus || "active",
        merged_into_guest_id: null,
      } as never)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.retiredId);
    if (reviveError) throw wave5Error(reviveError);

    const reverted = await admin
      .from("guest_merge_ledger")
      .update({ reverted_at: new Date().toISOString() })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", ledger.id);
    if (reverted.error) throw wave5Error(reverted.error);

    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: data.survivorId,
      eventType: "unmerged",
      newValues: { retired_id: data.retiredId },
      notes: "Merge reversed from ledger.",
      actorMembershipId: me.id,
    });
    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: data.retiredId,
      eventType: "unmerged",
      newValues: { survivor_id: data.survivorId },
      notes: "Merge reversed from ledger.",
      actorMembershipId: me.id,
    });
    return { ok: true as const, recorded: true as const, reason: null };
  });
