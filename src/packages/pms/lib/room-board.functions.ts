import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFrontOfficeAccess } from "@/packages/pms/lib/rooms.server";
import { getPropertyBusinessDate } from "@/packages/pms/lib/nightaudit.functions";
import { isMissingSchemaError } from "@/packages/pms/lib/pms-set2-structure";
import { expandStayRooms } from "@/packages/pms/lib/reservation-room-units";

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
  .validator((input: unknown) =>
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

      const reservationRows = (reservations ?? []) as Array<{
        id: string;
        room_id: string | null;
        arrival_date: string;
        departure_date: string;
        status: string;
      }>;
      const unitResult =
        reservationRows.length === 0
          ? { data: [], error: null }
          : await context.supabase
              .from("hotel_reservation_rooms")
              .select(
                "reservation_id, room_id, status, arrival_date, departure_date, unit_sequence",
              )
              .eq("restaurant_id", data.restaurantId)
              .in(
                "reservation_id",
                reservationRows.map((row) => row.id),
              );
      if (unitResult.error && !isMissingSchemaError(unitResult.error)) {
        throw new Error(unitResult.error.message);
      }
      const unitRows =
        unitResult.error && isMissingSchemaError(unitResult.error)
          ? null
          : ((unitResult.data ?? []) as Array<{
              reservation_id: string;
              room_id: string | null;
              status: string | null;
              arrival_date: string;
              departure_date: string;
              unit_sequence: number;
            }>);
      const stayRooms = expandStayRooms(
        reservationRows.map((row) => ({
          id: row.id,
          roomId: row.room_id,
          status: row.status,
          arrivalDate: row.arrival_date,
          departureDate: row.departure_date,
        })),
        unitRows
          ? unitRows.map((unit) => ({
              reservationId: unit.reservation_id,
              roomId: unit.room_id,
              status: unit.status,
              arrivalDate: unit.arrival_date,
              departureDate: unit.departure_date,
              unitSequence: unit.unit_sequence,
            }))
          : null,
      );
      const byRoom = new Map<string, RoomBoardOccupancyRow>();

      for (const reservation of stayRooms) {
        if (!reservation.roomId) {
          continue;
        }

        const roomId = reservation.roomId;
        const arrivalDate = reservation.arrivalDate;
        const departureDate = reservation.departureDate;

        if (reservation.status === "checked_in") {
          const state: RoomOccupancyState =
            departureDate <= businessDate ? "departing" : "occupied";

          byRoom.set(roomId, {
            roomId,
            state,
            reservationId: reservation.reservationId,
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
            reservationId: reservation.reservationId,
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
  .validator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
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
