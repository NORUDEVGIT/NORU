import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AuthedCtx } from "@/core/lib/workforce.server";
import { requirePmsActor, requirePmsActorAll } from "./pms-permissions.server";
import { PMS_PERMISSIONS } from "./pms-permissions";
import { recordReservationEvent } from "./reservations.server";
import {
  assertEtaLifecycle,
  assertExpectedArrivalInstant,
  assertLateCheckoutUntil,
  resolveLateCheckoutPolicy,
} from "./reservation-workspace/arrivals-departures";
import type { StayWriteRow } from "./reservation-workspace/arrivals-departures";
import { requirePersistedBusinessDate } from "./reservation-workspace/business-date";
import type { BulkEtaResult, LateCheckoutPolicy } from "./reservation-workspace/shared-read-models";
import { ETA_BULK_ITEM_CAP } from "./reservation-workspace/shared-read-models";
import {
  postLateCheckoutFeeCharge,
  type LateCheckoutFeePostResult,
} from "./cashiering-late-checkout.server";

const idSchema = z.string().uuid();
const instantSchema = z.string().min(1).nullable();

export type LateCheckoutApplyResult = {
  id: string;
  departureDate: string;
  lateCheckoutGranted: boolean;
  lateCheckoutUntil: string | null;
  lateCheckoutNote: string | null;
  policy: LateCheckoutPolicy;
  fee: LateCheckoutFeePostResult | { status: "skipped_revoke" };
};

async function requireLateCheckoutApprover(
  context: AuthedCtx,
  restaurantId: string,
  needsApproval: boolean,
  feeWillPost: boolean,
) {
  const permissions = [PMS_PERMISSIONS.FRONT_OFFICE_STAY_EDIT];
  if (needsApproval) permissions.push(PMS_PERMISSIONS.FRONT_OFFICE_FEE_OVERRIDE);
  if (feeWillPost) permissions.push(PMS_PERMISSIONS.CASHIERING_CHARGE_POST);
  if (permissions.length === 1) {
    return requirePmsActor(context, restaurantId, permissions[0]!);
  }
  return requirePmsActorAll(context, restaurantId, permissions);
}

async function loadStayForWrite(context: AuthedCtx, restaurantId: string, reservationId: string) {
  const { data, error } = await context.supabase
    .from("hotel_reservations")
    .select(
      "id, status, arrival_date, departure_date, expected_arrival_at, late_checkout_granted, late_checkout_until, late_checkout_note",
    )
    .eq("restaurant_id", restaurantId)
    .eq("id", reservationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Reservation not found for this property.");
  return data as StayWriteRow;
}

async function loadPropertyTimezone(
  restaurantId: string,
): Promise<{
  timezone: string;
  businessDate: string;
  policy: LateCheckoutPolicy;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select(
      "timezone, business_date, check_out_time, late_checkout_allowed, late_checkout_fee, late_checkout_needs_approval, checkin_ops",
    )
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Property not found.");
  const resolved = requirePersistedBusinessDate(data);
  return {
    timezone: resolved.timezone,
    businessDate: resolved.businessDate,
    policy: resolveLateCheckoutPolicy(data),
  };
}

export async function applyExpectedArrivalTime(params: {
  context: AuthedCtx;
  restaurantId: string;
  reservationId: string;
  expectedArrivalAt: string | null;
}): Promise<{ id: string; expectedArrivalAt: string | null }> {
  const me = await requirePmsActor(
    params.context,
    params.restaurantId,
    PMS_PERMISSIONS.FRONT_OFFICE_STAY_EDIT,
  );
  const stay = await loadStayForWrite(params.context, params.restaurantId, params.reservationId);
  assertEtaLifecycle(stay.status);
  const property = await loadPropertyTimezone(params.restaurantId);
  const next = assertExpectedArrivalInstant({
    expectedArrivalAt: params.expectedArrivalAt,
    arrivalDate: stay.arrival_date,
    timezone: property.timezone,
  });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("hotel_reservations")
    .update({ expected_arrival_at: next })
    .eq("id", params.reservationId)
    .eq("restaurant_id", params.restaurantId);
  if (error) throw new Error(error.message);

  await recordReservationEvent({
    restaurantId: params.restaurantId,
    reservationId: params.reservationId,
    eventType: "expected_arrival_updated",
    previousValues: { expected_arrival_at: stay.expected_arrival_at ?? null },
    newValues: { expected_arrival_at: next },
    actorMembershipId: me.id,
  });

  return { id: params.reservationId, expectedArrivalAt: next };
}

export async function applyLateCheckout(params: {
  context: AuthedCtx;
  restaurantId: string;
  reservationId: string;
  granted: boolean;
  until: string | null;
  note: string | null;
}): Promise<LateCheckoutApplyResult> {
  const property = await loadPropertyTimezone(params.restaurantId);
  const feeAmount =
    property.policy.fee != null && Number.isFinite(property.policy.fee)
      ? Number(property.policy.fee)
      : 0;
  const feeWillPost = params.granted && feeAmount > 0;
  const me = await requireLateCheckoutApprover(
    params.context,
    params.restaurantId,
    params.granted && property.policy.needsApproval,
    feeWillPost,
  );
  const stay = await loadStayForWrite(params.context, params.restaurantId, params.reservationId);
  if (stay.status !== "checked_in") {
    throw new Error("Late checkout is only available for in-house stays.");
  }
  if (params.granted && !property.policy.allowed) {
    throw new Error("Late checkout is not allowed by property policy.");
  }
  // Calendar overstay cannot be resolved via late checkout (same-day grants only).
  if (params.granted && stay.departure_date < property.businessDate) {
    throw new Error("Late checkout cannot be granted after the departure date has passed.");
  }

  const until = params.granted
    ? assertLateCheckoutUntil({
        until: params.until ?? "",
        departureDate: stay.departure_date,
        checkOutTime: property.policy.checkOutTime,
        timezone: property.timezone,
      })
    : null;
  const note = params.granted && params.note?.trim() ? params.note.trim() : null;

  // Fee before grant (same sequencing as cancel/no-show): never claim success when posting fails.
  let fee: LateCheckoutApplyResult["fee"] = { status: "skipped_revoke" };
  if (!params.granted) {
    fee = { status: "skipped_revoke" };
  } else if (!(feeAmount > 0)) {
    fee = { status: "skipped_zero" };
  } else {
    fee = await postLateCheckoutFeeCharge({
      restaurantId: params.restaurantId,
      reservationId: params.reservationId,
      amount: feeAmount,
      membershipId: me.id,
    });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: updated, error } = await supabaseAdmin
    .from("hotel_reservations")
    .update({
      late_checkout_granted: params.granted,
      late_checkout_until: until,
      late_checkout_note: note,
    })
    .eq("id", params.reservationId)
    .eq("restaurant_id", params.restaurantId)
    .select("id, departure_date, late_checkout_granted, late_checkout_until, late_checkout_note")
    .maybeSingle();
  if (error) {
    if (fee.status === "posted") {
      throw new Error(
        "The late checkout fee was added to the folio, but the grant could not be saved. Try granting again — the fee will not be charged twice.",
      );
    }
    throw new Error(error.message);
  }
  if (!updated) {
    if (fee.status === "posted") {
      throw new Error(
        "The late checkout fee was added to the folio, but the grant could not be saved. Try granting again — the fee will not be charged twice.",
      );
    }
    throw new Error("Reservation not found for this property.");
  }
  if (updated.departure_date !== stay.departure_date) {
    throw new Error("Late checkout must not change the departure date.");
  }

  await recordReservationEvent({
    restaurantId: params.restaurantId,
    reservationId: params.reservationId,
    eventType: "late_checkout_updated",
    previousValues: {
      late_checkout_granted: stay.late_checkout_granted ?? false,
      late_checkout_until: stay.late_checkout_until ?? null,
      late_checkout_note: stay.late_checkout_note ?? null,
      departure_date: stay.departure_date,
    },
    newValues: {
      late_checkout_granted: params.granted,
      late_checkout_until: until,
      late_checkout_note: note,
      departure_date: updated.departure_date,
      ...(fee.status === "posted" || fee.status === "already_posted"
        ? { late_checkout_fee_status: fee.status, late_checkout_fee_amount: fee.amount }
        : { late_checkout_fee_status: fee.status }),
    },
    actorMembershipId: me.id,
  });

  return {
    id: params.reservationId,
    departureDate: String(updated.departure_date),
    lateCheckoutGranted: params.granted,
    lateCheckoutUntil: until,
    lateCheckoutNote: note,
    policy: property.policy,
    fee,
  };
}

export const setExpectedArrivalTime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        expectedArrivalAt: instantSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    applyExpectedArrivalTime({
      context: context as AuthedCtx,
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      expectedArrivalAt: data.expectedArrivalAt,
    }),
  );

export const setLateCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        granted: z.boolean(),
        until: instantSchema.optional(),
        note: z.string().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    applyLateCheckout({
      context: context as AuthedCtx,
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      granted: data.granted,
      until: data.until ?? null,
      note: data.note ?? null,
    }),
  );

export const bulkSetExpectedArrivalTime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        items: z
          .array(
            z.object({
              reservationId: idSchema,
              expectedArrivalAt: instantSchema,
            }),
          )
          .min(1)
          .max(ETA_BULK_ITEM_CAP),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<BulkEtaResult> => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.FRONT_OFFICE_STAY_EDIT);
    const ok: BulkEtaResult["ok"] = [];
    const failed: BulkEtaResult["failed"] = [];
    for (const item of data.items) {
      try {
        await applyExpectedArrivalTime({
          context: context as AuthedCtx,
          restaurantId: data.restaurantId,
          reservationId: item.reservationId,
          expectedArrivalAt: item.expectedArrivalAt,
        });
        ok.push({ reservationId: item.reservationId, ok: true, message: null });
      } catch (error) {
        failed.push({
          reservationId: item.reservationId,
          ok: false,
          message: error instanceof Error ? error.message : "Could not update expected arrival.",
        });
      }
    }
    return { ok, failed };
  });
