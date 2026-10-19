/**
 * B02 — unit registration read and save.
 * Guest Profile owns the profile and guest_documents. This command does not
 * amend occupancy, merge duplicates, or create a guest.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  checkInIdentityVerification,
  registrationProfileColumns,
} from "@/packages/pms/lib/fo-check-in-registration";
import {
  loadCheckInUnitTarget,
  writeCheckInUnitProgress,
} from "@/packages/pms/lib/fo-check-in-unit.functions";
import {
  resolveGuestFieldRules,
  resolveIndividualProfileType,
} from "@/packages/pms/lib/guest-field-rules";
import { loadGuestWorkspaceConfig } from "@/packages/pms/lib/guest-workspace-config.functions";
import { diffFields, recordGuestEvent } from "@/packages/pms/lib/guests.server";
import {
  findGuestDuplicates,
  reviewGuestDocument,
  saveGuestDocument,
} from "@/packages/pms/lib/guests.functions";
import {
  recordReservationEvent,
  requireReservationManager,
} from "@/packages/pms/lib/reservations.server";

const idSchema = z.string().uuid();

const targetSchema = {
  restaurantId: idSchema,
  reservationId: idSchema,
  reservationRoomId: idSchema.optional(),
};

export type CheckInRegistrationDocument = {
  id: string;
  typeId: string | null;
  kind: string | null;
  documentNumber: string | null;
  issuingCountry: string | null;
  expiryDate: string | null;
  verificationStatus: string;
  hasFile: boolean;
};

export type CheckInRegistrationField = {
  code: string;
  label: string;
  required: boolean;
  value: string | null;
};

export type CheckInRegistrationRead = {
  guestId: string;
  guestSource: "unit_primary" | "booker";
  reservationRoomId: string | null;
  fields: CheckInRegistrationField[];
  documents: CheckInRegistrationDocument[];
  warnings: string[];
};

const PROFILE_SELECT =
  "id, first_name, last_name, middle_name, preferred_name, title, gender, date_of_birth, phone, email, nationality, language, address_line1, address_line2, city, region, country, postal_code";

function textValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const getCheckInRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object(targetSchema).parse(input))
  .handler(async ({ data, context }): Promise<CheckInRegistrationRead> => {
    await requireReservationManager(context as never, data.restaurantId);
    const target = await loadCheckInUnitTarget({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      ...(data.reservationRoomId ? { reservationRoomId: data.reservationRoomId } : {}),
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error } = await supabaseAdmin
      .from("guest_profiles")
      .select(PROFILE_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", target.primaryGuestId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) throw new Error("That guest could not be found.");

    const config = await loadGuestWorkspaceConfig(data.restaurantId);
    const profileType = resolveIndividualProfileType(config);
    const rules = resolveGuestFieldRules(config, profileType, "check_in");
    const record = profile as Record<string, unknown>;
    const fields: CheckInRegistrationField[] = rules
      .filter((rule) => rule.requiredForContext && rule.canonicalKey !== "documents")
      .map((rule) => {
        const column = rule.canonicalKey ? snake(rule.canonicalKey) : null;
        return {
          code: rule.code,
          label: rule.label,
          required: true,
          value: column ? textValue(record[column]) : null,
        };
      });

    const documentQuery = await supabaseAdmin
      .from("guest_documents")
      .select(
        "id, id_type_id, kind, document_number, issuing_country, expiry_date, verification_status, storage_path",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", target.primaryGuestId);
    if (documentQuery.error) throw new Error(documentQuery.error.message);
    const documents: CheckInRegistrationDocument[] = (documentQuery.data ?? []).map((row) => ({
      id: row.id,
      typeId: row.id_type_id,
      kind: row.kind,
      documentNumber: row.document_number,
      issuingCountry: row.issuing_country,
      expiryDate: row.expiry_date,
      verificationStatus: row.verification_status ?? "unverified",
      hasFile: Boolean(row.storage_path),
    }));
    const verification = checkInIdentityVerification({
      documents: documents.map((row) => ({
        typeId: row.typeId,
        verificationStatus: row.verificationStatus,
      })),
      types: config.identityDocumentTypes,
    });
    return {
      guestId: target.primaryGuestId,
      guestSource: target.guestSource,
      reservationRoomId: target.reservationRoomId,
      fields,
      documents,
      warnings: verification.warnings,
    };
  });

function snake(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export const saveCheckInUnitRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        ...targetSchema,
        fields: z.record(z.string().max(200).nullable()).optional(),
        document: z
          .object({
            documentId: idSchema.optional(),
            idTypeId: idSchema,
            documentNumber: z.string().max(120).optional().nullable(),
            issuingCountry: z.string().max(8).optional().nullable(),
            issueDate: z.string().max(20).optional().nullable(),
            expiryDate: z.string().max(20).optional().nullable(),
            issuingAuthority: z.string().max(200).optional().nullable(),
            notes: z.string().max(2000).optional().nullable(),
          })
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; guestId: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const target = await loadCheckInUnitTarget({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      ...(data.reservationRoomId ? { reservationRoomId: data.reservationRoomId } : {}),
    });
    const guestId = target.primaryGuestId;
    const columns = registrationProfileColumns(data.fields ?? {});
    if (Object.keys(columns).length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: before, error: beforeError } = await supabaseAdmin
        .from("guest_profiles")
        .select(Object.keys(columns).join(", "))
        .eq("restaurant_id", data.restaurantId)
        .eq("id", guestId)
        .maybeSingle();
      if (beforeError) throw new Error(beforeError.message);
      if (!before) throw new Error("That guest could not be found.");
      const { error } = await supabaseAdmin
        .from("guest_profiles")
        .update(columns)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", guestId);
      if (error) throw new Error(error.message);
      const profileDiff = diffFields(
        before as unknown as Record<string, unknown>,
        columns,
        Object.keys(columns),
      );
      if (profileDiff) {
        await recordGuestEvent({
          restaurantId: data.restaurantId,
          guestId,
          eventType: "profile_updated",
          previousValues: profileDiff.previous,
          newValues: profileDiff.next,
          actorMembershipId: me.id,
        });
      }
    }

    if (data.document) {
      const saved = await saveGuestDocument({
        data: {
          restaurantId: data.restaurantId,
          guestId,
          idTypeId: data.document.idTypeId,
          ...(data.document.documentId ? { documentId: data.document.documentId } : {}),
          ...(data.document.documentNumber !== undefined
            ? { documentNumber: data.document.documentNumber }
            : {}),
          ...(data.document.issuingCountry !== undefined
            ? { issuingCountry: data.document.issuingCountry }
            : {}),
          ...(data.document.issueDate !== undefined ? { issueDate: data.document.issueDate } : {}),
          ...(data.document.expiryDate !== undefined
            ? { expiryDate: data.document.expiryDate }
            : {}),
          ...(data.document.issuingAuthority !== undefined
            ? { issuingAuthority: data.document.issuingAuthority }
            : {}),
          ...(data.document.notes !== undefined ? { notes: data.document.notes } : {}),
        },
      });
      if (!saved.ok) throw new Error(saved.message);
    }

    await writeCheckInUnitProgress({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      reservationRoomId: target.reservationRoomId,
      patch: {
        registration_snapshot: {
          guestId,
          guestSource: target.guestSource,
          fields: columns,
        },
      },
    });
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      newValues: {
        reservation_room_id: target.reservationRoomId,
        guest_id: guestId,
        guest_source: target.guestSource,
      },
      notes: "Check-in registration saved.",
      actorMembershipId: me.id,
    });
    return { ok: true, guestId };
  });

export const searchCheckInGuestDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        email: z.string().max(200).optional().nullable(),
        phone: z.string().max(60).optional().nullable(),
        firstName: z.string().max(120).optional().nullable(),
        lastName: z.string().max(120).optional().nullable(),
        dateOfBirth: z.string().max(20).optional().nullable(),
        documentNumber: z.string().max(80).optional().nullable(),
        excludeGuestId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireReservationManager(context as never, data.restaurantId);
    return findGuestDuplicates({
      data: {
        restaurantId: data.restaurantId,
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
        ...(data.dateOfBirth !== undefined ? { dateOfBirth: data.dateOfBirth } : {}),
        ...(data.documentNumber !== undefined ? { documentNumber: data.documentNumber } : {}),
        ...(data.excludeGuestId ? { excludeGuestId: data.excludeGuestId } : {}),
      },
    });
  });

export const reviewCheckInGuestDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        documentId: idSchema,
        status: z.enum(["verified", "rejected"]),
        reason: z.string().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    return reviewGuestDocument({
      data: {
        restaurantId: data.restaurantId,
        guestId: data.guestId,
        documentId: data.documentId,
        status: data.status,
        ...(data.reason !== undefined ? { reason: data.reason } : {}),
      },
    });
  });
