/**
 * B05 — one readiness result for the target unit.
 * Completion still uses completeFoCheckIn until B07.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isKeyRecorded, isRegistrationComplete, isRoomReady } from "@/packages/pms/lib/fo-check-in";
import { getCheckInAgreement } from "@/packages/pms/lib/fo-check-in-agreement.functions";
import { getCheckInDepositReadiness } from "@/packages/pms/lib/fo-check-in.functions";
import { checkInIdentityVerification } from "@/packages/pms/lib/fo-check-in-registration";
import {
  evaluateCheckInReadiness,
  type CheckInReadiness,
  type CheckInReadinessFacts,
} from "@/packages/pms/lib/fo-check-in-readiness";
import {
  loadCheckInUnitTarget,
  loadUnitProgress,
  writeCheckInUnitProgress,
} from "@/packages/pms/lib/fo-check-in-unit.functions";
import { etaTiming } from "@/packages/pms/lib/fo-arrival";
import {
  resolveIndividualProfileType,
  validateGuestCheckInRequirements,
} from "@/packages/pms/lib/guest-field-rules";
import { loadGuestWorkspaceConfig } from "@/packages/pms/lib/guest-workspace-config.functions";
import { loadCard2HousekeepingSnapshot } from "@/packages/pms/lib/housekeeping-card2.functions";
import { resolvePropertyBusinessDate } from "@/packages/pms/lib/reservation-workspace/business-date";
import { requireReservationManager } from "@/packages/pms/lib/reservations.server";
import { getAssignmentEligibilityCompat } from "@/packages/pms/lib/room-inventory-compat";

const idSchema = z.string().uuid();

const blankRegistration = {
  fullName: "",
  phone: null,
  email: null,
  idDocumentType: null,
  idDocumentNumber: null,
};

function unitRequiredResult(): CheckInReadiness {
  return evaluateCheckInReadiness({
    unitRequired: true,
    target: null,
    registrationComplete: false,
    registrationWaived: false,
    registrationWaiverReason: null,
    registrationWaivedBy: null,
    registrationWaivedAt: null,
    guestFieldErrors: [],
    identityDocumentErrors: [],
    verificationWarnings: [],
    verificationBlockers: [],
    roomEligible: null,
    roomReady: null,
    roomReadyReason: null,
    deposit: null,
    agreementVersionId: null,
    agreementSigned: false,
    keyRecorded: false,
    keyWaived: false,
    keyWaiverReason: null,
    keyWaivedBy: null,
    keyWaivedAt: null,
    earlyArrival: false,
    earlyCheckInAllowed: null,
    earlyCheckInNeedsApproval: null,
  });
}

export const getCheckInReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        reservationRoomId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CheckInReadiness> => {
    await requireReservationManager(context as never, data.restaurantId);
    let target;
    try {
      target = await loadCheckInUnitTarget({
        restaurantId: data.restaurantId,
        reservationId: data.reservationId,
        ...(data.reservationRoomId ? { reservationRoomId: data.reservationRoomId } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Choose which room")) return unitRequiredResult();
      throw error;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const progress = await loadUnitProgress(supabaseAdmin, data.restaurantId, data.reservationId, {
      reservationRoomId: target.reservationRoomId,
      unitCount: target.unitCount,
    });
    if (target.status === "checked_in" && !progress.completedAt) {
      try {
        await writeCheckInUnitProgress({
          restaurantId: data.restaurantId,
          reservationId: data.reservationId,
          reservationRoomId: target.reservationRoomId,
          patch: { completed_at: new Date().toISOString() },
        });
      } catch {
        // The unit is already checked in. The next read tries the stamp again.
      }
    }
    const targetInput = {
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      ...(data.reservationRoomId ? { reservationRoomId: data.reservationRoomId } : {}),
    };
    const [agreement, financial] = await Promise.all([
      getCheckInAgreement({ data: targetInput, context }),
      getCheckInDepositReadiness({ data: targetInput, context }),
    ]);

    const workspaceConfig = await loadGuestWorkspaceConfig(data.restaurantId);
    const individualType = resolveIndividualProfileType(workspaceConfig);
    const { data: guestProfile } = await supabaseAdmin
      .from("guest_profiles")
      .select("*")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", target.primaryGuestId)
      .maybeSingle();
    const { data: guestDocuments, error: documentError } = await supabaseAdmin
      .from("guest_documents")
      .select(
        "id, id_type_id, kind, document_number, issuing_country, expiry_date, verification_status, storage_path",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", target.primaryGuestId);
    if (documentError) throw new Error(documentError.message);
    const documents = (guestDocuments ?? []).map((doc) => ({
      id: doc.id,
      typeId: doc.id_type_id,
      kind: doc.kind,
      documentNumberMasked: doc.document_number,
      issuingCountry: doc.issuing_country,
      expiryDate: doc.expiry_date,
      verificationStatus: doc.verification_status,
      hasFile: Boolean(doc.storage_path),
    }));
    const { data: property } = await supabaseAdmin
      .from("restaurants")
      .select(
        "timezone, business_date, check_in_time, early_checkin_allowed, early_checkin_needs_approval",
      )
      .eq("id", data.restaurantId)
      .maybeSingle();
    const today = resolvePropertyBusinessDate(
      property?.business_date ?? null,
      property?.timezone ?? "UTC",
    );
    const { data: customFieldRows } = await supabaseAdmin
      .from("guest_custom_field_values")
      .select("field_id, value_json")
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", target.primaryGuestId);
    const customValues: Record<string, unknown> = {};
    for (const row of customFieldRows ?? []) {
      customValues[row.field_id] = row.value_json;
    }
    const guestValidation = validateGuestCheckInRequirements({
      guest: guestProfile,
      documents,
      config: workspaceConfig,
      profileType: individualType,
      today,
      customFieldValues: customValues,
    });
    const identityDocumentErrors = guestValidation.missingFieldCodes.includes("IDENTITY_DOCUMENT")
      ? guestValidation.errors.filter((item) => /identity document/i.test(item))
      : [];
    const guestFieldErrors = guestValidation.errors.filter(
      (item) => !identityDocumentErrors.includes(item),
    );
    const verification = checkInIdentityVerification({
      documents: documents.map((doc) => ({
        typeId: doc.typeId,
        verificationStatus: doc.verificationStatus,
      })),
      types: workspaceConfig.identityDocumentTypes,
    });

    let roomEligible: boolean | null = null;
    let roomReady: boolean | null = null;
    let roomReadyReason: string | null = null;
    if (target.roomId) {
      const eligibility = await getAssignmentEligibilityCompat(
        supabaseAdmin,
        {
          restaurantId: data.restaurantId,
          roomId: target.roomId,
          roomTypeId: target.roomTypeId,
          arrival: target.arrivalDate,
          departure: target.departureDate,
          excludeReservationId: data.reservationId,
          adults: target.adults,
          children: target.children,
        },
        () => ({
          source: "legacy" as const,
          eligible: false,
          blockers: [],
          warnings: [],
          preferenceScore: 0,
          preferenceReasons: [],
        }),
      );
      roomEligible = eligibility.eligible;
      if (eligibility.eligible) {
        const { data: roomRow } = await supabaseAdmin
          .from("hotel_rooms")
          .select("id, status, housekeeping_status, maintenance_status")
          .eq("restaurant_id", data.restaurantId)
          .eq("id", target.roomId)
          .maybeSingle();
        const housekeeping = await loadCard2HousekeepingSnapshot(supabaseAdmin, data.restaurantId);
        const readiness = isRoomReady(
          roomRow
            ? {
                status: roomRow.status,
                housekeepingStatus: roomRow.housekeeping_status,
                maintenanceStatus: roomRow.maintenance_status,
              }
            : null,
          housekeeping.settings,
        );
        roomReady = readiness.ready;
        roomReadyReason = readiness.reason;
      }
    }

    const { data: stay } = await supabaseAdmin
      .from("hotel_reservations")
      .select("expected_arrival_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.reservationId)
      .maybeSingle();
    const timing = etaTiming({
      expectedArrivalAt: stay?.expected_arrival_at ?? null,
      checkInTime: property?.check_in_time ?? null,
      timezone: property?.timezone ?? "UTC",
    });

    const facts: CheckInReadinessFacts = {
      unitRequired: false,
      target: {
        reservationRoomId: target.reservationRoomId,
        guestId: target.primaryGuestId,
        guestSource: target.guestSource,
        status: target.status,
        roomId: target.roomId,
      },
      registrationComplete: isRegistrationComplete(
        progress.registrationSnapshot ?? blankRegistration,
      ),
      registrationWaived: progress.registrationWaived,
      registrationWaiverReason: progress.registrationWaiverReason,
      registrationWaivedBy: progress.registrationWaivedBy,
      registrationWaivedAt: progress.registrationWaivedAt,
      guestFieldErrors,
      identityDocumentErrors,
      verificationWarnings: verification.warnings,
      verificationBlockers: verification.blockers,
      roomEligible,
      roomReady,
      roomReadyReason,
      deposit: {
        requiredAmount: financial.requiredAmount,
        receivedAmount: financial.receivedAmount,
        outstanding: financial.outstanding,
        satisfied: financial.satisfied,
        waived: progress.depositWaived,
        waiverReason: progress.depositWaiverReason,
        waiverActor: progress.depositWaivedBy,
        waiverAt: progress.depositWaivedAt,
        guaranteeMethod: financial.guaranteeMethod,
      },
      agreementVersionId:
        agreement.blocker === "AGREEMENT_REQUIRED" ? null : (agreement.version?.id ?? null),
      agreementSigned: agreement.signed?.hasSignature === true,
      keyRecorded: isKeyRecorded({
        accessType: progress.keyAccessType,
        identifier: progress.keyIdentifier,
      }),
      keyWaived: progress.keyWaived,
      keyWaiverReason: progress.keyWaiverReason,
      keyWaivedBy: progress.keyWaivedBy,
      keyWaivedAt: progress.keyWaivedAt,
      earlyArrival: timing === "early",
      earlyCheckInAllowed: property?.early_checkin_allowed ?? null,
      earlyCheckInNeedsApproval: property?.early_checkin_needs_approval ?? null,
    };
    return evaluateCheckInReadiness(facts);
  });
