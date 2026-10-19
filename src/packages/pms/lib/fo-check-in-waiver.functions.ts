/**
 * B06 — one waiver on one unit. Owner or manager only.
 * Guest field rules, documents, rooms, agreement, and signature are not waivable.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertCheckInWaiverRole,
  checkInWaiverPatch,
  type CheckInWaiverRequirement,
} from "@/packages/pms/lib/fo-check-in-waiver";
import {
  loadCheckInUnitTarget,
  writeCheckInUnitProgress,
} from "@/packages/pms/lib/fo-check-in-unit.functions";
import {
  recordReservationEvent,
  requireReservationManager,
} from "@/packages/pms/lib/reservations.server";

const idSchema = z.string().uuid();

const waiverSchema = {
  restaurantId: idSchema,
  reservationId: idSchema,
  reservationRoomId: idSchema.optional(),
  reason: z.string().trim().min(1).max(500),
};

export async function commitCheckInUnitWaiver(input: {
  restaurantId: string;
  reservationId: string;
  reservationRoomId?: string;
  requirement: CheckInWaiverRequirement;
  reason: string;
  context: unknown;
}): Promise<{ ok: true; reservationRoomId: string | null }> {
  const me = await requireReservationManager(input.context as never, input.restaurantId);
  assertCheckInWaiverRole(me.role);
  const target = await loadCheckInUnitTarget({
    restaurantId: input.restaurantId,
    reservationId: input.reservationId,
    ...(input.reservationRoomId ? { reservationRoomId: input.reservationRoomId } : {}),
  });
  const at = new Date().toISOString();
  await writeCheckInUnitProgress({
    restaurantId: input.restaurantId,
    reservationId: input.reservationId,
    reservationRoomId: target.reservationRoomId,
    patch: checkInWaiverPatch(input.requirement, input.reason, me.id, at),
  });
  await recordReservationEvent({
    restaurantId: input.restaurantId,
    reservationId: input.reservationId,
    eventType: "amended",
    newValues: {
      requirement: input.requirement,
      reservation_room_id: target.reservationRoomId,
      reason: input.reason,
      actor_membership_id: me.id,
    },
    notes: "Check-in requirement waived.",
    actorMembershipId: me.id,
  });
  return { ok: true, reservationRoomId: target.reservationRoomId };
}

export const waiveCheckInUnitRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        ...waiverSchema,
        requirement: z.enum(["registration", "deposit", "key"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    commitCheckInUnitWaiver({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      ...(data.reservationRoomId ? { reservationRoomId: data.reservationRoomId } : {}),
      requirement: data.requirement,
      reason: data.reason,
      context,
    }),
  );
