import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AuthedCtx } from "@/core/lib/workforce.server";
import {
  recordReservationEvent,
  requireReservationManager,
} from "./reservations.server";
import {
  assertEtaLifecycle,
  assertExpectedArrivalInstant,
  assertLateCheckoutUntil,
  parseLateCheckoutPolicy,
} from "./reservation-workspace/arrivals-departures";
import type { StayWriteRow } from "./reservation-workspace/arrivals-departures";
import type { BulkEtaResult, LateCheckoutPolicy } from "./reservation-workspace/shared-read-models";
import { ETA_BULK_ITEM_CAP } from "./reservation-workspace/shared-read-models";

const idSchema = z.string().uuid();
const instantSchema = z.string().min(1).nullable();

async function requireLateCheckoutApprover(context: AuthedCtx, restaurantId: string, needsApproval: boolean) {
  const membership = await requireReservationManager(context, restaurantId);
  if (needsApproval && membership.role !== "owner" && membership.role !== "manager") {
    throw new Error("Late checkout for this property requires owner or manager approval.");
  }
  return membership;
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
  policy: LateCheckoutPolicy;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select(
      "timezone, check_out_time, late_checkout_allowed, late_checkout_fee, late_checkout_needs_approval",
    )
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Property not found.");
  return {
    timezone: data.timezone || "UTC",
    policy: parseLateCheckoutPolicy(data),
  };
}

export async function applyExpectedArrivalTime(params: {
  context: AuthedCtx;
  restaurantId: string;
  reservationId: string;
  expectedArrivalAt: string | null;
}): Promise<{ id: string; expectedArrivalAt: string | null }> {
  const me = await requireReservationManager(params.context, params.restaurantId);
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
}): Promise<{
  id: string;
  departureDate: string;
  lateCheckoutGranted: boolean;
  lateCheckoutUntil: string | null;
  lateCheckoutNote: string | null;
  policy: LateCheckoutPolicy;
}> {
  const property = await loadPropertyTimezone(params.restaurantId);
  const me = await requireLateCheckoutApprover(
    params.context,
    params.restaurantId,
    params.granted && property.policy.needsApproval,
  );
  const stay = await loadStayForWrite(params.context, params.restaurantId, params.reservationId);
  if (stay.status !== "checked_in") {
    throw new Error("Late checkout is only available for in-house stays.");
  }
  if (params.granted && !property.policy.allowed) {
    throw new Error("Late checkout is not allowed by property policy.");
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
  if (error) throw new Error(error.message);
  if (!updated) throw new Error("Reservation not found for this property.");
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
  };
}

export const setExpectedArrivalTime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
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
  .inputValidator((input: unknown) =>
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
  .inputValidator((input: unknown) =>
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
    await requireReservationManager(context as never, data.restaurantId);
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
