/**
 * B04 — registration agreement version and the signed instance for one unit.
 * Property Setup publishes the version. Front Office stores the instance.
 * Profile consent and email signatures are not this record.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MANAGE_ROLES } from "@/core/lib/workforce.server";
import {
  copyAcknowledgements,
  projectCheckInAgreement,
  signatureStoragePrefix,
  type CheckInAgreementAcknowledgement,
  type CheckInAgreementDraft,
  type CheckInAgreementRead,
  type CheckInAgreementSignature,
  type CheckInAgreementVersion,
} from "@/packages/pms/lib/fo-check-in-agreement";
import {
  asGuestAgreementAcknowledgements,
  asGuestAgreementSections,
  missingRequiredAcknowledgements,
  projectCheckInAgreementContent,
} from "@/packages/pms/lib/guest-agreement-config";
import { loadCheckInUnitTarget } from "@/packages/pms/lib/fo-check-in-unit.functions";
import {
  recordReservationEvent,
  requireReservationManager,
  reservationError,
} from "@/packages/pms/lib/reservations.server";

const idSchema = z.string().uuid();

const targetSchema = {
  restaurantId: idSchema,
  reservationId: idSchema,
  reservationRoomId: idSchema.optional(),
};

const acknowledgementSchema = z
  .record(z.string().trim().min(1).max(40), z.boolean())
  .refine((value) => {
    const count = Object.keys(value).length;
    return count >= 1 && count <= 20;
  }, "Choose the acknowledgements that were shown.");

// These tables are not in the generated Database type until 0170 is applied.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = any;

type AgreementRow = {
  id: string;
  agreement_version_id: string;
  reservation_room_id: string | null;
  guest_id: string;
  acknowledgements: CheckInAgreementAcknowledgement | null;
  signed_at: string | null;
  captured_by_membership_id: string | null;
  signature_storage_path: string | null;
};

function requireSupervisor(role: string): void {
  if (!(MANAGE_ROLES as readonly string[]).includes(role)) {
    throw new Error("An owner or manager has to publish the registration agreement.");
  }
}

function asAcknowledgements(value: unknown): CheckInAgreementAcknowledgement {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const copy: CheckInAgreementAcknowledgement = {};
  for (const [key, flag] of Object.entries(value as Record<string, unknown>)) {
    if (typeof flag === "boolean") copy[key] = flag;
  }
  return copy;
}

function toSignature(row: AgreementRow): CheckInAgreementSignature | null {
  if (!row.signed_at || !row.captured_by_membership_id) return null;
  return {
    id: row.id,
    agreementVersionId: row.agreement_version_id,
    guestId: row.guest_id,
    reservationRoomId: row.reservation_room_id,
    acknowledgements: asAcknowledgements(row.acknowledgements),
    signedAt: row.signed_at,
    capturedBy: row.captured_by_membership_id,
    hasSignature: Boolean(row.signature_storage_path),
  };
}

function toDraft(row: AgreementRow): CheckInAgreementDraft {
  return {
    id: row.id,
    agreementVersionId: row.agreement_version_id,
    guestId: row.guest_id,
    reservationRoomId: row.reservation_room_id,
    acknowledgements: asAcknowledgements(row.acknowledgements),
  };
}

async function loadActiveVersion(
  db: UntypedDb,
  restaurantId: string,
): Promise<CheckInAgreementVersion | null> {
  const { data, error } = await db
    .from("pms_registration_agreement_versions")
    .select(
      "id, version_label, body, title, intro, lead_in, acknowledgement_title, acknowledgement_intro, agreement_sections, acknowledgements",
    )
    .eq("restaurant_id", restaurantId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw reservationError(error.message);
  if (!data) return null;
  return projectCheckInAgreementContent({
    id: data.id,
    label: data.version_label,
    body: data.body,
    title: data.title ?? null,
    intro: data.intro ?? null,
    leadIn: data.lead_in ?? null,
    acknowledgementTitle: data.acknowledgement_title ?? null,
    acknowledgementIntro: data.acknowledgement_intro ?? null,
    sections: asGuestAgreementSections(data.agreement_sections),
    acknowledgements: asGuestAgreementAcknowledgements(data.acknowledgements),
  });
}

function scopeUnit(query: UntypedDb, reservationRoomId: string | null): UntypedDb {
  if (reservationRoomId) return query.eq("reservation_room_id", reservationRoomId);
  return query.is("reservation_room_id", null);
}

async function loadInstanceRows(
  db: UntypedDb,
  restaurantId: string,
  reservationId: string,
  reservationRoomId: string | null,
  agreementVersionId: string,
): Promise<AgreementRow[]> {
  const query = db
    .from("fo_checkin_agreement_instances")
    .select(
      "id, agreement_version_id, reservation_room_id, guest_id, acknowledgements, signed_at, captured_by_membership_id, signature_storage_path",
    )
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId)
    .eq("agreement_version_id", agreementVersionId);
  const { data, error } = await scopeUnit(query, reservationRoomId);
  if (error) throw reservationError(error.message);
  return (data ?? []) as AgreementRow[];
}

function historyValues(input: {
  agreementVersionId: string;
  guestId: string;
  reservationRoomId: string | null;
  instanceId: string;
}): Record<string, unknown> {
  return {
    agreement_version_id: input.agreementVersionId,
    guest_id: input.guestId,
    reservation_room_id: input.reservationRoomId,
    instance_id: input.instanceId,
  };
}

export const getCheckInAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object(targetSchema).parse(input))
  .handler(async ({ data, context }): Promise<CheckInAgreementRead> => {
    await requireReservationManager(context as never, data.restaurantId);
    const target = await loadCheckInUnitTarget({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      ...(data.reservationRoomId ? { reservationRoomId: data.reservationRoomId } : {}),
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as UntypedDb;
    const version = await loadActiveVersion(db, data.restaurantId);
    if (!version) {
      return projectCheckInAgreement({
        reservationRoomId: target.reservationRoomId,
        guestId: target.primaryGuestId,
        guestSource: target.guestSource,
        version: null,
        signed: null,
        draft: null,
      });
    }
    const rows = await loadInstanceRows(
      db,
      data.restaurantId,
      data.reservationId,
      target.reservationRoomId,
      version.id,
    );
    const signedRow = rows
      .filter((row) => row.signed_at)
      .sort((left, right) => String(right.signed_at).localeCompare(String(left.signed_at)))[0];
    const draftRow = rows.find((row) => !row.signed_at);
    return projectCheckInAgreement({
      reservationRoomId: target.reservationRoomId,
      guestId: target.primaryGuestId,
      guestSource: target.guestSource,
      version,
      signed: signedRow ? toSignature(signedRow) : null,
      draft: draftRow ? toDraft(draftRow) : null,
    });
  });

export const publishCheckInAgreementVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        versionLabel: z.string().trim().min(1).max(80),
        body: z.string().trim().min(1).max(20000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    requireSupervisor(me.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as UntypedDb;
    const { error: retireError } = await db
      .from("pms_registration_agreement_versions")
      .update({ active: false })
      .eq("restaurant_id", data.restaurantId)
      .eq("active", true);
    if (retireError) throw reservationError(retireError.message);
    const { data: inserted, error } = await db
      .from("pms_registration_agreement_versions")
      .insert({
        restaurant_id: data.restaurantId,
        version_label: data.versionLabel,
        body: data.body,
        active: true,
        created_by_membership_id: me.id,
      })
      .select("id, version_label, body")
      .single();
    if (error || !inserted) throw reservationError(error?.message ?? "AGREEMENT_VERSION_IMMUTABLE");
    return {
      id: inserted.id as string,
      label: inserted.version_label as string,
      body: inserted.body as string,
    };
  });

export const saveCheckInAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        ...targetSchema,
        agreementVersionId: idSchema,
        acknowledgements: acknowledgementSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const target = await loadCheckInUnitTarget({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      ...(data.reservationRoomId ? { reservationRoomId: data.reservationRoomId } : {}),
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as UntypedDb;
    const version = await loadActiveVersion(db, data.restaurantId);
    if (!version) throw reservationError("AGREEMENT_REQUIRED");
    if (version.id !== data.agreementVersionId)
      throw reservationError("AGREEMENT_VERSION_MISMATCH");
    const acknowledgements = copyAcknowledgements(data.acknowledgements);
    const missing = missingRequiredAcknowledgements(version.acknowledgements, acknowledgements);
    if (missing.length > 0) throw reservationError("AGREEMENT_ACK_REQUIRED");
    const rows = await loadInstanceRows(
      db,
      data.restaurantId,
      data.reservationId,
      target.reservationRoomId,
      version.id,
    );
    const signed = rows.find((row) => row.signed_at);
    const draft = rows.find((row) => !row.signed_at);
    if (signed) throw reservationError("AGREEMENT_ALREADY_SIGNED");

    let instanceId = draft?.id ?? null;
    if (draft && draft.guest_id === target.primaryGuestId) {
      const { error } = await db
        .from("fo_checkin_agreement_instances")
        .update({ acknowledgements })
        .eq("restaurant_id", data.restaurantId)
        .eq("id", draft.id)
        .is("signed_at", null);
      if (error) throw reservationError(error.message);
    } else {
      if (draft) {
        const { error: deleteError } = await db
          .from("fo_checkin_agreement_instances")
          .delete()
          .eq("restaurant_id", data.restaurantId)
          .eq("id", draft.id)
          .is("signed_at", null);
        if (deleteError) throw reservationError(deleteError.message);
      }
      const { data: inserted, error } = await db
        .from("fo_checkin_agreement_instances")
        .insert({
          restaurant_id: data.restaurantId,
          agreement_version_id: version.id,
          reservation_id: data.reservationId,
          reservation_room_id: target.reservationRoomId,
          guest_id: target.primaryGuestId,
          acknowledgements,
          created_by_membership_id: me.id,
        })
        .select("id")
        .single();
      if (error || !inserted)
        throw reservationError(error?.message ?? "Could not save the agreement.");
      instanceId = inserted.id as string;
    }
    if (!instanceId) throw reservationError("AGREEMENT_NOT_READY");
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      newValues: historyValues({
        agreementVersionId: version.id,
        guestId: target.primaryGuestId,
        reservationRoomId: target.reservationRoomId,
        instanceId,
      }),
      notes: "Registration agreement saved.",
      actorMembershipId: me.id,
    });
    return { instanceId, agreementVersionId: version.id };
  });

export const captureCheckInAgreementSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        ...targetSchema,
        agreementVersionId: idSchema,
        storagePath: z.string().trim().min(1).max(500),
        method: z.literal("drawn"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const prefix = signatureStoragePrefix(data.restaurantId, data.reservationId);
    if (!data.storagePath.startsWith(prefix) || data.storagePath.includes("..")) {
      throw new Error("Invalid signature reference.");
    }
    const target = await loadCheckInUnitTarget({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      ...(data.reservationRoomId ? { reservationRoomId: data.reservationRoomId } : {}),
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as UntypedDb;
    const version = await loadActiveVersion(db, data.restaurantId);
    if (!version) throw reservationError("AGREEMENT_REQUIRED");
    if (version.id !== data.agreementVersionId)
      throw reservationError("AGREEMENT_VERSION_MISMATCH");
    const rows = await loadInstanceRows(
      db,
      data.restaurantId,
      data.reservationId,
      target.reservationRoomId,
      version.id,
    );
    const draft = rows.find((row) => !row.signed_at);
    if (!draft) throw reservationError("AGREEMENT_NOT_READY");
    if (draft.guest_id !== target.primaryGuestId)
      throw reservationError("AGREEMENT_GUEST_MISMATCH");
    if (draft.reservation_room_id !== target.reservationRoomId) {
      throw reservationError("ROOM_UNIT_NOT_FOUND");
    }
    const signedAt = new Date().toISOString();
    const { data: updated, error } = await db
      .from("fo_checkin_agreement_instances")
      .update({
        signed_at: signedAt,
        captured_by_membership_id: me.id,
        signature_storage_path: data.storagePath,
        signature_method: "drawn",
      })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", draft.id)
      .is("signed_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw reservationError(error.message);
    if (!updated) throw reservationError("AGREEMENT_INSTANCE_IMMUTABLE");
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      newValues: historyValues({
        agreementVersionId: version.id,
        guestId: target.primaryGuestId,
        reservationRoomId: target.reservationRoomId,
        instanceId: draft.id,
      }),
      notes: "Registration agreement signed.",
      actorMembershipId: me.id,
    });
    return { instanceId: draft.id, signedAt };
  });

export const beginCheckInAgreementResign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        ...targetSchema,
        agreementVersionId: idSchema,
        acknowledgements: acknowledgementSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const target = await loadCheckInUnitTarget({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      ...(data.reservationRoomId ? { reservationRoomId: data.reservationRoomId } : {}),
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as UntypedDb;
    const version = await loadActiveVersion(db, data.restaurantId);
    if (!version) throw reservationError("AGREEMENT_REQUIRED");
    if (version.id !== data.agreementVersionId)
      throw reservationError("AGREEMENT_VERSION_MISMATCH");
    const rows = await loadInstanceRows(
      db,
      data.restaurantId,
      data.reservationId,
      target.reservationRoomId,
      version.id,
    );
    if (!rows.some((row) => row.signed_at)) throw reservationError("AGREEMENT_NOT_SIGNED");
    if (rows.some((row) => !row.signed_at)) throw reservationError("AGREEMENT_OPEN_DRAFT");
    const acknowledgements = copyAcknowledgements(data.acknowledgements);
    const { data: inserted, error } = await db
      .from("fo_checkin_agreement_instances")
      .insert({
        restaurant_id: data.restaurantId,
        agreement_version_id: version.id,
        reservation_id: data.reservationId,
        reservation_room_id: target.reservationRoomId,
        guest_id: target.primaryGuestId,
        acknowledgements,
        created_by_membership_id: me.id,
      })
      .select("id")
      .single();
    if (error || !inserted)
      throw reservationError(error?.message ?? "Could not start a new signature.");
    const instanceId = inserted.id as string;
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      newValues: historyValues({
        agreementVersionId: version.id,
        guestId: target.primaryGuestId,
        reservationRoomId: target.reservationRoomId,
        instanceId,
      }),
      notes: "Registration agreement re-sign started.",
      actorMembershipId: me.id,
    });
    return { instanceId, agreementVersionId: version.id };
  });
