import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDays } from "./reservation-dates";
import { requireFrontOfficeAccess, requireRoomManager } from "./rooms.server";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export type OverbookingRoomTypeNight = {
  roomTypeId: string;
  roomTypeName: string;
  physicalCapacity: number;
  demand: number;
  physicalAvailable: number;
  shortage: number;
  overbookingEnabled: boolean;
  maximumOverbooking: number | null;
  percentageLimit: number | null;
  configurationInvalid: boolean;
  overbookingAllowance: number;
  overbookingConsumed: number;
  overbookingRemaining: number;
  effectiveBookable: number;
};

export type OverbookingNight = {
  night: string;
  physicalCapacity: number;
  confirmedDemand: number;
  physicalAvailable: number;
  totalOverbookedRooms: number;
  roomTypesOverbooked: number;
  propertyOverbookingEnabled: boolean;
  alertEnabled: boolean;
  roomTypes: OverbookingRoomTypeNight[];
};

export type RoomTypeOverbookingRuleRow = {
  roomTypeId: string;
  roomTypeName: string;
  enabled: boolean;
  maximumOverbooking: number | null;
  percentageLimit: number | null;
};

type BoardClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function loadOverbookingNights(
  db: BoardClient,
  restaurantId: string,
  start: string,
  end: string,
): Promise<OverbookingNight[]> {
  const { data, error } = await db.rpc("pms_property_overbooking_board", {
    _restaurant_id: restaurantId,
    _start: start,
    _end: end,
  });
  if (error) return [];
  const nights = (data as { nights?: unknown } | null)?.nights;
  if (!Array.isArray(nights)) return [];
  return nights.flatMap((night) => {
    const row = night as Partial<OverbookingNight>;
    if (!row.night) return [];
    return [
      {
        night: row.night,
        physicalCapacity: Number(row.physicalCapacity ?? 0),
        confirmedDemand: Number(row.confirmedDemand ?? 0),
        physicalAvailable: Number(row.physicalAvailable ?? 0),
        totalOverbookedRooms: Number(row.totalOverbookedRooms ?? 0),
        roomTypesOverbooked: Number(row.roomTypesOverbooked ?? 0),
        propertyOverbookingEnabled: Boolean(row.propertyOverbookingEnabled),
        alertEnabled: Boolean(row.alertEnabled),
        roomTypes: Array.isArray(row.roomTypes)
          ? row.roomTypes.map((type) => ({
              roomTypeId: String(type.roomTypeId ?? ""),
              roomTypeName: String(type.roomTypeName ?? "Room"),
              physicalCapacity: Number(type.physicalCapacity ?? 0),
              demand: Number(type.demand ?? 0),
              physicalAvailable: Number(type.physicalAvailable ?? 0),
              shortage: Number(type.shortage ?? 0),
              overbookingEnabled: Boolean(type.overbookingEnabled),
              maximumOverbooking:
                type.maximumOverbooking == null ? null : Number(type.maximumOverbooking),
              percentageLimit: type.percentageLimit == null ? null : Number(type.percentageLimit),
              configurationInvalid: Boolean(type.configurationInvalid),
              overbookingAllowance: Number(type.overbookingAllowance ?? 0),
              overbookingConsumed: Number(type.overbookingConsumed ?? 0),
              overbookingRemaining: Number(type.overbookingRemaining ?? 0),
              effectiveBookable: Number(type.effectiveBookable ?? 0),
            }))
          : [],
      },
    ];
  });
}

export function overbookingShortageRows(nights: OverbookingNight[]) {
  return nights.flatMap((night) =>
    night.roomTypes
      .filter((type) => type.shortage > 0)
      .map((type) => ({
        date: night.night,
        roomTypeId: type.roomTypeId,
        roomTypeName: type.roomTypeName,
        shortage: type.shortage,
      })),
  );
}

export const getOverbookingBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, start: dateSchema, end: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nights = await loadOverbookingNights(
      supabaseAdmin as never,
      data.restaurantId,
      data.start,
      data.end,
    );
    return { nights };
  });

export function overbookingHorizon(businessDate: string): { start: string; end: string } {
  return { start: businessDate, end: addDays(businessDate, 6) };
}

export const listRoomTypeOverbookingRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as never as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => Promise<{
            data: Array<Record<string, unknown>> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
    const types = await db
      .from("room_types")
      .select("id, name, active")
      .eq("restaurant_id", data.restaurantId);
    if (types.error) throw new Error(types.error.message);
    const rules = await db
      .from("pms_room_type_overbooking_rules")
      .select("room_type_id, enabled, maximum_overbooking, percentage_limit")
      .eq("restaurant_id", data.restaurantId);
    if (rules.error) throw new Error(rules.error.message);
    const byType = new Map((rules.data ?? []).map((row) => [String(row.room_type_id), row]));
    const rows: RoomTypeOverbookingRuleRow[] = (types.data ?? [])
      .filter((row) => row.active !== false)
      .map((row) => {
        const rule = byType.get(String(row.id));
        return {
          roomTypeId: String(row.id),
          roomTypeName: String(row.name ?? "Room"),
          enabled: Boolean(rule?.enabled),
          maximumOverbooking:
            rule?.maximum_overbooking == null ? null : Number(rule.maximum_overbooking),
          percentageLimit: rule?.percentage_limit == null ? null : Number(rule.percentage_limit),
        };
      })
      .sort((left, right) => left.roomTypeName.localeCompare(right.roomTypeName));
    return { rules: rows };
  });

type QueryError = { message: string } | null;
type RuleDb = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => {
          maybeSingle: () => Promise<{ data: { id: string } | null; error: QueryError }>;
        };
      };
    };
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (column: string, value: string) => Promise<{ error: QueryError }>;
      };
    };
    insert: (row: Record<string, unknown>) => Promise<{ error: QueryError }>;
  };
};

export const saveRoomTypeOverbookingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomTypeId: idSchema,
        enabled: z.boolean(),
        maximumOverbooking: z.number().int().min(0).nullable(),
        percentageLimit: z.number().min(0).max(100).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireRoomManager(context as never, data.restaurantId);
    if (data.enabled && data.maximumOverbooking == null && data.percentageLimit == null) {
      throw new Error("Enter a maximum or a percentage before enabling this room type.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as never as RuleDb;
    const existing = await db
      .from("pms_room_type_overbooking_rules")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("room_type_id", data.roomTypeId)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    const payload = {
      enabled: data.enabled,
      maximum_overbooking: data.maximumOverbooking,
      percentage_limit: data.percentageLimit,
      updated_by_membership_id: me.id,
    };
    const saved = existing.data
      ? await db
          .from("pms_room_type_overbooking_rules")
          .update(payload)
          .eq("restaurant_id", data.restaurantId)
          .eq("room_type_id", data.roomTypeId)
      : await db.from("pms_room_type_overbooking_rules").insert({
          ...payload,
          restaurant_id: data.restaurantId,
          room_type_id: data.roomTypeId,
          created_by_membership_id: me.id,
        });
    if (saved.error) throw new Error(saved.error.message);
    return { ok: true as const };
  });

export type OverbookingControls = {
  managerApprovalRequired: boolean;
  reasonRequired: boolean;
  dateBasedLimitEnabled: boolean;
};

export const getOverbookingControls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<OverbookingControls> => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as never as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (
            column: string,
            value: string,
          ) => {
            maybeSingle: () => Promise<{
              data: Record<string, unknown> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
    const loaded = await db
      .from("pms_inventory_rules")
      .select("manager_approval_required, overbooking_reason_required, date_based_limit_enabled")
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (loaded.error) throw new Error(loaded.error.message);
    return {
      managerApprovalRequired: loaded.data ? Boolean(loaded.data.manager_approval_required) : true,
      reasonRequired: loaded.data ? Boolean(loaded.data.overbooking_reason_required) : true,
      dateBasedLimitEnabled: Boolean(loaded.data?.date_based_limit_enabled),
    };
  });

export type OverbookingDateLimit = {
  id: string;
  roomTypeId: string;
  roomTypeName: string;
  startDate: string;
  endDate: string;
  enabled: boolean;
  maximumOverbooking: number | null;
  percentageLimit: number | null;
};

export const listOverbookingDateLimits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as never as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (
            column: string,
            value: string,
          ) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
        };
      };
    };
    const [limits, types] = await Promise.all([
      db
        .from("pms_overbooking_date_limits")
        .select("id, room_type_id, start_date, end_date, enabled, maximum_overbooking, percentage_limit")
        .eq("restaurant_id", data.restaurantId),
      db.from("room_types").select("id, name").eq("restaurant_id", data.restaurantId),
    ]);
    if (limits.error) throw new Error(limits.error.message);
    if (types.error) throw new Error(types.error.message);
    const names = new Map((types.data ?? []).map((row) => [String(row.id), String(row.name ?? "Room")]));
    const rows: OverbookingDateLimit[] = (limits.data ?? [])
      .map((row) => ({
        id: String(row.id),
        roomTypeId: String(row.room_type_id),
        roomTypeName: names.get(String(row.room_type_id)) ?? "Room",
        startDate: String(row.start_date),
        endDate: String(row.end_date),
        enabled: Boolean(row.enabled),
        maximumOverbooking: row.maximum_overbooking == null ? null : Number(row.maximum_overbooking),
        percentageLimit: row.percentage_limit == null ? null : Number(row.percentage_limit),
      }))
      .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.roomTypeName.localeCompare(right.roomTypeName));
    return { limits: rows };
  });

export const saveOverbookingDateLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        id: idSchema.optional(),
        roomTypeId: idSchema,
        startDate: dateSchema,
        endDate: dateSchema,
        enabled: z.boolean(),
        maximumOverbooking: z.number().int().min(0).nullable(),
        percentageLimit: z.number().min(0).max(100).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireRoomManager(context as never, data.restaurantId);
    if (data.endDate <= data.startDate) throw new Error("The end date must be after the start date.");
    if (data.maximumOverbooking == null && data.percentageLimit == null) {
      throw new Error("Enter a maximum or a percentage. Use 0 to allow no extra rooms on these dates.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as never as RuleDb;
    const payload = {
      room_type_id: data.roomTypeId,
      start_date: data.startDate,
      end_date: data.endDate,
      enabled: data.enabled,
      maximum_overbooking: data.maximumOverbooking,
      percentage_limit: data.percentageLimit,
      updated_by_membership_id: me.id,
    };
    const saved = data.id
      ? await db
          .from("pms_overbooking_date_limits")
          .update(payload)
          .eq("restaurant_id", data.restaurantId)
          .eq("id", data.id)
      : await db.from("pms_overbooking_date_limits").insert({
          ...payload,
          restaurant_id: data.restaurantId,
          created_by_membership_id: me.id,
        });
    if (saved.error) throw new Error(saved.error.message);
    return { ok: true as const };
  });

export const deleteOverbookingDateLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as never as {
      from: (table: string) => {
        delete: () => {
          eq: (
            column: string,
            value: string,
          ) => {
            eq: (column: string, value: string) => Promise<{ error: QueryError }>;
          };
        };
      };
    };
    const removed = await db
      .from("pms_overbooking_date_limits")
      .delete()
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.id);
    if (removed.error) throw new Error(removed.error.message);
    return { ok: true as const };
  });
