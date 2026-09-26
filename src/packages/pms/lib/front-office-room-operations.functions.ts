import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireReservationManager } from "./reservations.server";
import {
  loadFrontOfficeRoomHistory,
  loadFrontOfficeRoomOpsQueue,
  loadFrontOfficeRoomQuickView,
} from "./front-office-room-operations.server";
import type { FoRoomHistoryRow, FoRoomQuickView, RoomOpsQueueItem } from "./front-office-room-operations";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const getFrontOfficeRoomQuickView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, roomId: idSchema, businessDate: dateSchema, hasDiscrepancy: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<FoRoomQuickView> => {
    await requireReservationManager(context as never, data.restaurantId);
    return loadFrontOfficeRoomQuickView({
      supabase: context.supabase,
      restaurantId: data.restaurantId,
      roomId: data.roomId,
      businessDate: data.businessDate,
      hasDiscrepancy: data.hasDiscrepancy === true,
    });
  });

export const getFrontOfficeRoomOperationsQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, businessDate: dateSchema }).parse(input))
  .handler(async ({ data, context }): Promise<RoomOpsQueueItem[]> => {
    const membership = await requireReservationManager(context as never, data.restaurantId);
    return loadFrontOfficeRoomOpsQueue({
      supabase: context.supabase,
      context: context as never,
      membership,
      restaurantId: data.restaurantId,
      businessDate: data.businessDate,
    });
  });

export const getFrontOfficeRoomHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, roomId: idSchema, limit: z.number().int().min(1).max(200).optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<FoRoomHistoryRow[]> => {
    await requireReservationManager(context as never, data.restaurantId);
    return loadFrontOfficeRoomHistory({
      supabase: context.supabase,
      restaurantId: data.restaurantId,
      roomId: data.roomId,
      limit: data.limit,
    });
  });
