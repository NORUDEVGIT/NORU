import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFrontOfficeAccess } from "@/packages/pms/lib/rooms.server";
import { getPropertyBusinessDate } from "@/packages/pms/lib/nightaudit.functions";

const idSchema = z.string().uuid();

type LooseResult = {
  data: unknown;
  error: { message?: string | null } | null;
};

interface LooseQuery extends PromiseLike<LooseResult> {
  select(columns: string): LooseQuery;
  eq(column: string, value: unknown): LooseQuery;
  lte(column: string, value: unknown): LooseQuery;
  gt(column: string, value: unknown): LooseQuery;
}

function looseDb(client: unknown): { from(table: string): LooseQuery } {
  return client as { from(table: string): LooseQuery };
}

export type RoomOccupancyState = "vacant" | "reserved" | "occupied" | "departing";

export interface RoomBoardOccupancyRow {
  roomId: string;
  state: RoomOccupancyState;
  reservationId: string;
  arrivalDate: string;
  departureDate: string;
}

export interface RoomBoardBlockRow {
  blockId: string;
  roomId: string;
  blockType: string;
  reason: string;
}

export const listRoomBoardOccupancy = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      businessDate: string;
      rows: RoomBoardOccupancyRow[];
    }> => {
      await requireFrontOfficeAccess(context as never, data.restaurantId);

      const propertyDate = await getPropertyBusinessDate({
        data: {
          restaurantId: data.restaurantId,
        },
      });

      const businessDate = propertyDate.businessDate;

      const { data: reservations, error } = await context.supabase
        .from("hotel_reservations")
        .select("id, room_id, arrival_date, departure_date, status")
        .eq("restaurant_id", data.restaurantId)
        .not("room_id", "is", null)
        .in("status", ["pending", "confirmed", "checked_in"]);

      if (error) {
        throw new Error(error.message);
      }

      const byRoom = new Map<string, RoomBoardOccupancyRow>();

      for (const reservation of reservations ?? []) {
        if (!reservation.room_id) {
          continue;
        }

        const roomId = reservation.room_id;
        const arrivalDate = reservation.arrival_date;
        const departureDate = reservation.departure_date;

        if (reservation.status === "checked_in") {
          const state: RoomOccupancyState =
            departureDate <= businessDate ? "departing" : "occupied";

          byRoom.set(roomId, {
            roomId,
            state,
            reservationId: reservation.id,
            arrivalDate,
            departureDate,
          });

          continue;
        }

        if (departureDate <= businessDate) {
          continue;
        }

        const existing = byRoom.get(roomId);

        if (existing?.state === "occupied" || existing?.state === "departing") {
          continue;
        }

        if (!existing || arrivalDate < existing.arrivalDate) {
          byRoom.set(roomId, {
            roomId,
            state: "reserved",
            reservationId: reservation.id,
            arrivalDate,
            departureDate,
          });
        }
      }

      return {
        businessDate,
        rows: [...byRoom.values()],
      };
    },
  );

export const listRoomBoardBlocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(
    async ({ data, context }): Promise<{ businessDate: string; rows: RoomBoardBlockRow[] }> => {
      await requireFrontOfficeAccess(context as never, data.restaurantId);
      const propertyDate = await getPropertyBusinessDate({
        data: { restaurantId: data.restaurantId },
      });
      const businessDate = propertyDate.businessDate;
      const result = await looseDb(context.supabase)
        .from("pms_operational_inventory_blocks")
        .select("id, room_id, block_type, reason")
        .eq("restaurant_id", data.restaurantId)
        .eq("target_kind", "room")
        .eq("status", "active")
        .lte("start_date", businessDate)
        .gt("end_date", businessDate);

      if (result.error) {
        throw new Error(result.error.message || "Could not load active room blocks.");
      }
      const rows = Array.isArray(result.data) ? result.data : [];
      return {
        businessDate,
        rows: rows.flatMap((value) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return [];
          const row = value as Record<string, unknown>;
          if (typeof row["id"] !== "string" || typeof row["room_id"] !== "string") return [];
          return [
            {
              blockId: row["id"],
              roomId: row["room_id"],
              blockType: typeof row["block_type"] === "string" ? row["block_type"] : "operational",
              reason: typeof row["reason"] === "string" ? row["reason"] : "Operational block",
            },
          ];
        }),
      };
    },
  );
