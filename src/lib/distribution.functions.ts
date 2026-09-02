import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CHANNEL_STATUSES,
  blankToNull,
  canManageDistribution,
  requireDistributionManager,
} from "./distribution.server";
import { callerMembership } from "./workforce.server";

const idSchema = z.string().uuid();

export interface DistributionChannel {
  id: string;
  channelType: string;
  code: string;
  name: string;
  status: string;
  notes: string | null;
}

export interface RoomMapping {
  id: string;
  channelId: string;
  roomTypeId: string;
  roomTypeName: string;
  externalCode: string | null;
  active: boolean;
}

export interface RateMapping {
  id: string;
  channelId: string;
  ratePlanId: string;
  ratePlanName: string;
  externalCode: string | null;
  active: boolean;
}

export interface DistributionLogEntry {
  id: string;
  eventType: string;
  status: string;
  message: string | null;
  createdAt: string;
}

export interface DirectBookingSettings {
  slug: string;
  enabled: boolean;
  contactEmail: string | null;
  contactPhone: string | null;
  bookingMessage: string | null;
}

export const getDistributionAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await callerMembership(context as never, data.restaurantId);
    return { role: me.role, canManage: canManageDistribution(me.role) };
  });

export const getDistributionOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      channels: DistributionChannel[];
      roomMappings: RoomMapping[];
      rateMappings: RateMapping[];
      logs: DistributionLogEntry[];
      settings: DirectBookingSettings;
      roomTypes: { id: string; name: string }[];
      ratePlans: { id: string; name: string }[];
      directBookings: number;
    }> => {
      await requireDistributionManager(context as never, data.restaurantId);
      const db = context.supabase;

      const [channels, rooms, rates, logs, property, roomTypes, ratePlans, direct] = await Promise.all([
        db
          .from("distribution_channels")
          .select("id, channel_type, code, name, status, notes")
          .eq("restaurant_id", data.restaurantId)
          .order("code"),
        db
          .from("distribution_room_mappings")
          .select("id, channel_id, room_type_id, external_room_code, active, room_types ( name )")
          .eq("restaurant_id", data.restaurantId),
        db
          .from("distribution_rate_mappings")
          .select("id, channel_id, rate_plan_id, external_rate_code, active, hotel_rate_plans ( name )")
          .eq("restaurant_id", data.restaurantId),
        db
          .from("distribution_logs")
          .select("id, event_type, status, message, created_at")
          .eq("restaurant_id", data.restaurantId)
          .order("created_at", { ascending: false })
          .limit(50),
        db
          .from("restaurants")
          .select("slug, direct_booking_enabled, booking_contact_email, booking_contact_phone, booking_message")
          .eq("id", data.restaurantId)
          .maybeSingle(),
        db
          .from("room_types")
          .select("id, name")
          .eq("restaurant_id", data.restaurantId)
          .eq("active", true)
          .order("name"),
        db
          .from("hotel_rate_plans")
          .select("id, name")
          .eq("restaurant_id", data.restaurantId)
          .eq("active", true)
          .order("name"),
        db
          .from("hotel_reservations")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", data.restaurantId)
          .eq("source", "direct_booking"),
      ]);

      return {
        channels: (channels.data ?? []).map((c) => ({
          id: c.id,
          channelType: c.channel_type,
          code: c.code,
          name: c.name,
          status: c.status,
          notes: c.notes,
        })),
        roomMappings: (rooms.data ?? []).map((m) => ({
          id: m.id,
          channelId: m.channel_id,
          roomTypeId: m.room_type_id,
          roomTypeName: (m.room_types as { name: string } | null)?.name ?? "Room type",
          externalCode: m.external_room_code,
          active: m.active,
        })),
        rateMappings: (rates.data ?? []).map((m) => ({
          id: m.id,
          channelId: m.channel_id,
          ratePlanId: m.rate_plan_id,
          ratePlanName: (m.hotel_rate_plans as { name: string } | null)?.name ?? "Rate plan",
          externalCode: m.external_rate_code,
          active: m.active,
        })),
        logs: (logs.data ?? []).map((l) => ({
          id: l.id,
          eventType: l.event_type,
          status: l.status,
          message: l.message,
          createdAt: l.created_at,
        })),
        settings: {
          slug: property.data?.slug ?? "",
          enabled: property.data?.direct_booking_enabled ?? true,
          contactEmail: property.data?.booking_contact_email ?? null,
          contactPhone: property.data?.booking_contact_phone ?? null,
          bookingMessage: property.data?.booking_message ?? null,
        },
        roomTypes: roomTypes.data ?? [],
        ratePlans: ratePlans.data ?? [],
        directBookings: direct.count ?? 0,
      };
    },
  );

export const saveDirectBookingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        enabled: z.boolean(),
        contactEmail: z.string().trim().max(160).nullable().optional(),
        contactPhone: z.string().trim().max(40).nullable().optional(),
        bookingMessage: z.string().trim().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; message: string }> => {
    await requireDistributionManager(context as never, data.restaurantId);
    const { error } = await context.supabase
      .from("restaurants")
      .update({
        direct_booking_enabled: data.enabled,
        booking_contact_email: blankToNull(data.contactEmail),
        booking_contact_phone: blankToNull(data.contactPhone),
        booking_message: blankToNull(data.bookingMessage),
      })
      .eq("id", data.restaurantId);
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  });

export const setChannelStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ restaurantId: idSchema, channelId: idSchema, status: z.enum(CHANNEL_STATUSES) })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; message: string }> => {
    await requireDistributionManager(context as never, data.restaurantId);
    const { error } = await context.supabase
      .from("distribution_channels")
      .update({ status: data.status })
      .eq("id", data.channelId)
      .eq("restaurant_id", data.restaurantId);
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  });

export const saveRoomMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        channelId: idSchema,
        roomTypeId: idSchema,
        externalCode: z.string().trim().max(80).nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; message: string }> => {
    await requireDistributionManager(context as never, data.restaurantId);
    const { error } = await context.supabase.from("distribution_room_mappings").upsert(
      {
        restaurant_id: data.restaurantId,
        channel_id: data.channelId,
        room_type_id: data.roomTypeId,
        external_room_code: blankToNull(data.externalCode),
        active: data.active ?? true,
      },
      { onConflict: "channel_id,room_type_id" },
    );
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  });

export const saveRateMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        channelId: idSchema,
        ratePlanId: idSchema,
        externalCode: z.string().trim().max(80).nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; message: string }> => {
    await requireDistributionManager(context as never, data.restaurantId);
    const { error } = await context.supabase.from("distribution_rate_mappings").upsert(
      {
        restaurant_id: data.restaurantId,
        channel_id: data.channelId,
        rate_plan_id: data.ratePlanId,
        external_rate_code: blankToNull(data.externalCode),
        active: data.active ?? true,
      },
      { onConflict: "channel_id,rate_plan_id" },
    );
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  });
