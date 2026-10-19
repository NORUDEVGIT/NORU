/**
 * Guest Services configuration for the property registration agreement.
 * Check-in still reads the active version through getCheckInAgreement.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { MANAGE_ROLES } from "@/core/lib/workforce.server";
import { normalizeClock } from "@/packages/pms/lib/pms-set1-foundation";
import {
  asGuestAgreementAcknowledgements,
  asGuestAgreementSections,
  canManageGuestAgreement,
  copyGuestAgreementPackage,
  nextGuestAgreementLabel,
  normalizeGuestAgreementDraft,
  publishGuestAgreementSnapshot,
  type GuestAgreementPackage,
} from "@/packages/pms/lib/guest-agreement-config";
import { seedGuestAgreementDraft } from "@/packages/pms/lib/guest-agreement.server";
import {
  requireReservationManager,
  reservationError,
} from "@/packages/pms/lib/reservations.server";

const idSchema = z.string().uuid();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = any;

const sectionSchema = z
  .object({
    id: z.string().trim().min(1).max(40),
    title: z.string().trim().min(1).max(120),
    descriptionTemplate: z.string().trim().min(1).max(4000),
    resolvedDescription: z.string().nullable().optional(),
    enabled: z.boolean(),
    displayOrder: z.number().int().min(0).max(9999),
  })
  .strict();

const acknowledgementSchema = z
  .object({
    id: z.string().trim().min(1).max(40),
    title: z.string().trim().min(1).max(120),
    statement: z.string().trim().min(1).max(2000),
    enabled: z.boolean(),
    required: z.boolean(),
    displayOrder: z.number().int().min(0).max(9999),
  })
  .strict();

const packageSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    intro: z.string().trim().max(2000),
    leadIn: z.string().trim().max(2000),
    acknowledgementTitle: z.string().trim().max(120),
    acknowledgementIntro: z.string().trim().max(2000),
    sections: z.array(sectionSchema).min(1).max(40),
    acknowledgements: z.array(acknowledgementSchema).min(1).max(20),
  })
  .strict();

type VersionRow = {
  id: string;
  version_label: string;
  body: string;
  active: boolean;
  title: string | null;
  intro: string | null;
  lead_in: string | null;
  acknowledgement_title: string | null;
  acknowledgement_intro: string | null;
  agreement_sections: unknown;
  acknowledgements: unknown;
  resolved_check_in_time: string | null;
  resolved_check_out_time: string | null;
  published_at: string | null;
  created_at: string;
};

const VERSION_COLUMNS =
  "id, version_label, body, active, title, intro, lead_in, acknowledgement_title, acknowledgement_intro, agreement_sections, acknowledgements, resolved_check_in_time, resolved_check_out_time, published_at, created_at";

function assertManager(role: string): void {
  if (!canManageGuestAgreement(role) || !(MANAGE_ROLES as readonly string[]).includes(role)) {
    throw new Error("An owner or manager has to manage the guest agreement.");
  }
}

function packageFromRow(row: VersionRow): GuestAgreementPackage | null {
  const sections = asGuestAgreementSections(row.agreement_sections);
  const acknowledgements = asGuestAgreementAcknowledgements(row.acknowledgements);
  if (!sections || !acknowledgements || sections.length === 0 || acknowledgements.length === 0) {
    if (!row.body?.trim()) return null;
    return {
      title: row.title?.trim() || row.version_label,
      intro: row.intro ?? "",
      leadIn: row.lead_in ?? "",
      acknowledgementTitle: row.acknowledgement_title?.trim() || "Guest Acknowledgement",
      acknowledgementIntro: row.acknowledgement_intro ?? "",
      sections: [
        {
          id: "agreement_body",
          title: row.version_label,
          descriptionTemplate: row.body,
          resolvedDescription: null,
          enabled: true,
          displayOrder: 10,
        },
      ],
      acknowledgements: [
        {
          id: "reviewed",
          title: "Reviewed with the guest",
          statement: "Reviewed with the guest",
          enabled: true,
          required: true,
          displayOrder: 10,
        },
      ],
    };
  }
  return {
    title: row.title ?? "",
    intro: row.intro ?? "",
    leadIn: row.lead_in ?? "",
    acknowledgementTitle: row.acknowledgement_title ?? "",
    acknowledgementIntro: row.acknowledgement_intro ?? "",
    sections,
    acknowledgements,
  };
}

function versionView(row: VersionRow) {
  return {
    id: row.id,
    label: row.version_label,
    active: row.active,
    publishedAt: row.published_at,
    editable: row.published_at == null,
    legacy: row.agreement_sections == null,
    body: row.body,
    agreement: packageFromRow(row),
    resolvedCheckInTime: row.resolved_check_in_time,
    resolvedCheckOutTime: row.resolved_check_out_time,
  };
}

async function writeAudit(
  db: UntypedDb,
  restaurantId: string,
  userId: string,
  action: string,
  versionId: string,
) {
  const result = await db.from("restaurant_staff_audit_log").insert({
    restaurant_id: restaurantId,
    actor_user_id: userId,
    target_user_id: userId,
    action,
    metadata: { section: "guest-agreement", agreementVersionId: versionId } as Json,
  });
  if (result.error) console.error("[guest-agreement] audit", result.error.message);
}

async function loadVersions(db: UntypedDb, restaurantId: string): Promise<VersionRow[]> {
  const result = await db
    .from("pms_registration_agreement_versions")
    .select(VERSION_COLUMNS)
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });
  if (result.error) throw reservationError(result.error.message);
  return (result.data ?? []) as VersionRow[];
}

async function loadPropertyTimes(db: UntypedDb, restaurantId: string) {
  const result = await db
    .from("restaurants")
    .select("check_in_time, check_out_time")
    .eq("id", restaurantId)
    .maybeSingle();
  if (result.error) throw reservationError(result.error.message);
  return {
    checkInTime: normalizeClock(String(result.data?.check_in_time ?? "")) || null,
    checkOutTime: normalizeClock(String(result.data?.check_out_time ?? "")) || null,
  };
}

function columnValues(agreement: GuestAgreementPackage, extra: Record<string, unknown>) {
  return {
    title: agreement.title,
    intro: agreement.intro,
    lead_in: agreement.leadIn,
    acknowledgement_title: agreement.acknowledgementTitle,
    acknowledgement_intro: agreement.acknowledgementIntro,
    agreement_sections: agreement.sections,
    acknowledgements: agreement.acknowledgements,
    ...extra,
  };
}

export const getGuestAgreementConfiguration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    assertManager(me.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as UntypedDb;
    await seedGuestAgreementDraft(db, data.restaurantId, me.id);
    const [rows, times] = await Promise.all([
      loadVersions(db, data.restaurantId),
      loadPropertyTimes(db, data.restaurantId),
    ]);
    const views = rows.map(versionView);
    return {
      active: views.find((row) => row.active) ?? null,
      draft: views.find((row) => row.editable) ?? null,
      history: views.map((row) => ({
        id: row.id,
        label: row.label,
        active: row.active,
        publishedAt: row.publishedAt,
        editable: row.editable,
      })),
      checkInTime: times.checkInTime,
      checkOutTime: times.checkOutTime,
    };
  });

export const createGuestAgreementVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, sourceVersionId: idSchema.optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    assertManager(me.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as UntypedDb;
    const rows = await loadVersions(db, data.restaurantId);
    if (rows.some((row) => row.published_at == null))
      throw reservationError("AGREEMENT_DRAFT_EXISTS");
    const source =
      rows.find((row) => row.id === data.sourceVersionId) ??
      rows.find((row) => row.active) ??
      rows[0];
    if (!source) throw reservationError("AGREEMENT_DRAFT_REQUIRED");
    const agreement = packageFromRow(source);
    if (!agreement) throw reservationError("AGREEMENT_CONFIG_INVALID");
    const copied = copyGuestAgreementPackage(agreement);
    const inserted = await db
      .from("pms_registration_agreement_versions")
      .insert({
        restaurant_id: data.restaurantId,
        version_label: nextGuestAgreementLabel(rows.map((row) => row.version_label)),
        body: source.body,
        active: false,
        created_by_membership_id: me.id,
        ...columnValues(copied, {}),
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data)
      throw reservationError(inserted.error?.message ?? "AGREEMENT_CONFIG_INVALID");
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      "guest_agreement_draft_created",
      inserted.data.id,
    );
    return { id: inserted.data.id as string };
  });

export const updateGuestAgreementDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        versionId: idSchema,
        agreement: packageSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    assertManager(me.role);
    const agreement = normalizeGuestAgreementDraft(data.agreement as GuestAgreementPackage);
    if (!agreement) throw reservationError("AGREEMENT_CONFIG_INVALID");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as UntypedDb;
    const updated = await db
      .from("pms_registration_agreement_versions")
      .update(
        columnValues(agreement, {
          body: sourceBody(agreement),
          resolved_check_in_time: null,
          resolved_check_out_time: null,
        }),
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.versionId)
      .is("published_at", null)
      .select("id")
      .maybeSingle();
    if (updated.error) throw reservationError(updated.error.message);
    if (!updated.data) throw reservationError("AGREEMENT_VERSION_IMMUTABLE");
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      "guest_agreement_draft_updated",
      data.versionId,
    );
    return { id: data.versionId };
  });

export const publishGuestAgreementVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, versionId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    assertManager(me.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as UntypedDb;
    const rows = await loadVersions(db, data.restaurantId);
    const draft = rows.find((row) => row.id === data.versionId && row.published_at == null);
    if (!draft) throw reservationError("AGREEMENT_DRAFT_REQUIRED");
    const agreement = packageFromRow(draft);
    if (!agreement) throw reservationError("AGREEMENT_CONFIG_INVALID");
    const times = await loadPropertyTimes(db, data.restaurantId);
    const published = publishGuestAgreementSnapshot(agreement, times);
    if (!published.ok) throw reservationError(published.code);
    const retired = await db
      .from("pms_registration_agreement_versions")
      .update({ active: false })
      .eq("restaurant_id", data.restaurantId)
      .eq("active", true);
    if (retired.error) throw reservationError(retired.error.message);
    const saved = await db
      .from("pms_registration_agreement_versions")
      .update(
        columnValues(published.package, {
          body: published.body,
          active: true,
          published_at: new Date().toISOString(),
          published_by: me.id,
          resolved_check_in_time: published.checkInTime,
          resolved_check_out_time: published.checkOutTime,
        }),
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("id", draft.id)
      .is("published_at", null)
      .select("id")
      .maybeSingle();
    if (saved.error) throw reservationError(saved.error.message);
    if (!saved.data) throw reservationError("AGREEMENT_VERSION_IMMUTABLE");
    await writeAudit(db, data.restaurantId, context.userId, "guest_agreement_published", draft.id);
    return { id: draft.id };
  });

function sourceBody(agreement: GuestAgreementPackage): string {
  const sections = [...agreement.sections]
    .filter((section) => section.enabled)
    .sort((left, right) => left.displayOrder - right.displayOrder);
  return [
    agreement.title,
    agreement.intro,
    agreement.leadIn,
    ...sections.map((section) => `${section.title}\n${section.descriptionTemplate}`),
  ]
    .filter((part) => part.trim())
    .join("\n\n")
    .slice(0, 20000);
}
