import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireHousekeepingManager } from "./housekeeping.server";
import { requireFrontOfficeAccess } from "./rooms.server";
import {
  getAssignmentEligibilityCompat,
  getRoomTypeAvailabilityCompat,
  type AssignmentEligibilityResult,
} from "./room-inventory-compat";

const idSchema = z.string().uuid();

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

type LooseResult = {
  data: unknown;
  error: { message?: string | null } | null;
};

interface LooseQuery extends PromiseLike<LooseResult> {
  select(columns: string): LooseQuery;
  eq(column: string, value: unknown): LooseQuery;
  gt(column: string, value: unknown): LooseQuery;
  lt(column: string, value: unknown): LooseQuery;
  order(column: string, options?: { ascending?: boolean }): LooseQuery;
  limit(value: number): LooseQuery;
}

type LooseDbClient = {
  from(table: string): LooseQuery;
};

type LooseRpcClient = {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message?: string | null } | null }>;
};

function looseDb(client: unknown): LooseDbClient {
  return client as LooseDbClient;
}

function looseRpc(client: unknown): LooseRpcClient {
  return client as LooseRpcClient;
}

export interface InventoryAvailabilityNight {
  date: string;
  physicalCapacity: number;
  pinnedRoomClaims: number;
  typeHold: boolean;
  quantityHoldApplied: number;
  unrepresentedReservationDemand: number;
  available: number;
}

export interface RoomTypeInventoryAvailability {
  roomTypeId: string;
  code: string;
  name: string;
  source: "canonical" | "legacy";
  physicalCapacity: number;
  available: number;
  reserved: number | null;
  businessDate: string | null;
  limitingDate: string | null;
  overbookingAllowance: number;
  nightly: InventoryAvailabilityNight[];
}

export interface RoomInventoryEvent {
  id: string;
  eventType: string;
  roomId: string | null;
  roomNumber: string | null;
  blockId: string | null;
  actorMembershipId: string;
  previousValues: string | null;
  newValues: string | null;
  notes: string | null;
  createdAt: string;
}

const blockTargetKindSchema = z.enum(["room", "room_type", "quantity"]);

const blockStatusSchema = z.enum(["draft", "pending_approval", "active", "released", "cancelled"]);

export type OperationalBlockTargetKind = z.infer<typeof blockTargetKindSchema>;
export type OperationalBlockStatus = z.infer<typeof blockStatusSchema>;

export interface OperationalInventoryBlock {
  id: string;
  restaurantId: string;

  targetKind: OperationalBlockTargetKind;

  roomId: string | null;
  roomTypeId: string;
  quantity: number | null;
  groupId: string | null;

  blockType: string;
  inventoryImpact: string;
  approvalRequired: boolean;

  status: OperationalBlockStatus;

  startDate: string;
  endDate: string;

  reason: string;
  notes: string | null;
  releaseReason: string | null;

  createdByMembershipId: string;
  approvedByMembershipId: string | null;
  activatedByMembershipId: string | null;
  releasedByMembershipId: string | null;
  cancelledByMembershipId: string | null;

  createdAt: string;
  updatedAt: string;

  approvedAt: string | null;
  activatedAt: string | null;
  releasedAt: string | null;
  cancelledAt: string | null;
}

const createBlockSchema = z
  .object({
    restaurantId: idSchema,

    targetKind: blockTargetKindSchema,

    roomId: idSchema.nullable().optional(),
    roomTypeId: idSchema,

    quantity: z.number().int().positive().nullable().optional(),
    groupId: idSchema.nullable().optional(),

    blockType: z.string().trim().min(1).max(100),

    startDate: dateSchema,
    endDate: dateSchema,

    reason: z.string().trim().min(1).max(500),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.endDate <= input.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date must be after start date.",
      });
    }

    if (input.targetKind === "room") {
      if (!input.roomId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["roomId"],
          message: "A room is required for a room-target block.",
        });
      }

      if (input.quantity != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["quantity"],
          message: "Quantity is not used for a room-target block.",
        });
      }
    }

    if (input.targetKind === "room_type") {
      if (input.roomId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["roomId"],
          message: "Room is not used for a room-type block.",
        });
      }

      if (input.quantity != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["quantity"],
          message: "Quantity is not used for a room-type block.",
        });
      }
    }

    if (input.targetKind === "quantity") {
      if (input.roomId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["roomId"],
          message: "Room is not used for a quantity block.",
        });
      }

      if (input.quantity == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["quantity"],
          message: "Quantity is required for a quantity block.",
        });
      }
    }
  });

function blankToNull(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function blockError(error: unknown, fallback: string): Error {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return new Error(error.message);
  }

  return new Error(fallback);
}

/**
 * Block mutation RPCs are intentionally owner/manager operations in 0095.
 *
 * Use the existing membership/authz helper rather than trusting a membership
 * supplied by the browser. Then tighten the result to the roles accepted by
 * the block RPCs themselves.
 */
async function requireOperationalBlockManager(context: never, restaurantId: string) {
  const membership = await requireHousekeepingManager(context, restaurantId);

  if (membership.role !== "owner" && membership.role !== "manager") {
    throw new Error("You don't have permission to manage operational inventory blocks.");
  }

  return membership;
}

/* ------------------------------------------------------------------ reads */

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapAvailabilityNight(value: unknown): InventoryAvailabilityNight | null {
  const row = objectValue(value);
  if (!row || typeof row["date"] !== "string") return null;
  return {
    date: row["date"],
    physicalCapacity: numberValue(row["physical_capacity"] ?? row["physicalCapacity"]),
    pinnedRoomClaims: numberValue(row["pinned_room_claims"] ?? row["pinnedRoomClaims"]),
    typeHold: Boolean(row["type_hold"] ?? row["typeHold"]),
    quantityHoldApplied: numberValue(row["quantity_hold_applied"] ?? row["quantityHoldApplied"]),
    unrepresentedReservationDemand: numberValue(
      row["unrepresented_reservation_demand"] ?? row["unrepresentedReservationDemand"],
    ),
    available: numberValue(row["available"]),
  };
}

const availabilityReadSchema = z
  .object({
    restaurantId: idSchema,
    arrival: dateSchema,
    departure: dateSchema,
  })
  .superRefine((input, ctx) => {
    if (input.departure <= input.arrival) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["departure"],
        message: "Departure must be after arrival.",
      });
    }
  });

export const listRoomTypeInventoryAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => availabilityReadSchema.parse(input))
  .handler(async ({ data, context }): Promise<RoomTypeInventoryAvailability[]> => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);

    const roomTypeResult = await looseDb(context.supabase)
      .from("room_types")
      .select("id, code, name")
      .eq("restaurant_id", data.restaurantId)
      .eq("active", true)
      .order("name");
    if (roomTypeResult.error)
      throw new Error(roomTypeResult.error.message || "Could not load room types.");
    const roomTypes = (Array.isArray(roomTypeResult.data) ? roomTypeResult.data : [])
      .map(objectValue)
      .filter((roomType): roomType is Record<string, unknown> => roomType !== null);

    return Promise.all(
      roomTypes.map(async (roomType) => {
        const roomTypeId = String(roomType["id"] ?? "");
        const availability = await getRoomTypeAvailabilityCompat(context.supabase, {
          restaurantId: data.restaurantId,
          roomTypeId,
          arrival: data.arrival,
          departure: data.departure,
        });
        return {
          roomTypeId,
          code: String(roomType["code"] ?? ""),
          name: String(roomType["name"] ?? ""),
          source: availability.source,
          physicalCapacity: availability.physicalCapacity,
          available: availability.available,
          reserved: availability.reserved,
          businessDate: availability.businessDate,
          limitingDate: availability.limitingDate,
          overbookingAllowance: availability.overbookingAllowance,
          nightly: availability.nightly
            .map(mapAvailabilityNight)
            .filter((night): night is InventoryAvailabilityNight => night !== null),
        };
      }),
    );
  });

export const listRoomInventoryEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RoomInventoryEvent[]> => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);

    const result = await looseDb(context.supabase)
      .from("pms_room_inventory_events")
      .select(
        "id,event_type,room_id,block_id,actor_membership_id,previous_values,new_values,notes,created_at,hotel_rooms(room_number)",
      )
      .eq("restaurant_id", data.restaurantId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (result.error) throw new Error(result.error.message || "Could not load inventory history.");

    const rows = Array.isArray(result.data) ? result.data : [];
    return rows.flatMap((value) => {
      const row = objectValue(value);
      if (
        !row ||
        typeof row["id"] !== "string" ||
        typeof row["event_type"] !== "string" ||
        typeof row["actor_membership_id"] !== "string" ||
        typeof row["created_at"] !== "string"
      ) {
        return [];
      }
      const roomRelation = objectValue(row["hotel_rooms"]);
      return [
        {
          id: row["id"],
          eventType: row["event_type"],
          roomId: typeof row["room_id"] === "string" ? row["room_id"] : null,
          roomNumber:
            roomRelation && typeof roomRelation["room_number"] === "string"
              ? roomRelation["room_number"]
              : null,
          blockId: typeof row["block_id"] === "string" ? row["block_id"] : null,
          actorMembershipId: row["actor_membership_id"],
          previousValues:
            row["previous_values"] == null ? null : JSON.stringify(row["previous_values"]),
          newValues: row["new_values"] == null ? null : JSON.stringify(row["new_values"]),
          notes: typeof row["notes"] === "string" ? row["notes"] : null,
          createdAt: row["created_at"],
        },
      ];
    });
  });

export const listOperationalBlocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,

        status: blockStatusSchema.optional(),

        roomId: idSchema.optional(),
        roomTypeId: idSchema.optional(),

        fromDate: dateSchema.optional(),
        toDate: dateSchema.optional(),

        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<OperationalInventoryBlock[]> => {
    await requireOperationalBlockManager(context as never, data.restaurantId);

    let query = looseDb(context.supabase)
      .from("pms_operational_inventory_blocks")
      .select(
        [
          "id",
          "restaurant_id",
          "target_kind",
          "room_id",
          "room_type_id",
          "quantity",
          "group_id",
          "block_type",
          "inventory_impact",
          "approval_required",
          "status",
          "start_date",
          "end_date",
          "reason",
          "notes",
          "release_reason",
          "created_by_membership_id",
          "approved_by_membership_id",
          "activated_by_membership_id",
          "released_by_membership_id",
          "cancelled_by_membership_id",
          "created_at",
          "updated_at",
          "approved_at",
          "activated_at",
          "released_at",
          "cancelled_at",
        ].join(", "),
      )
      .eq("restaurant_id", data.restaurantId)
      .order("start_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.status) {
      query = query.eq("status", data.status);
    }

    if (data.roomId) {
      query = query.eq("room_id", data.roomId);
    }

    if (data.roomTypeId) {
      query = query.eq("room_type_id", data.roomTypeId);
    }

    /*
     * Stored block dates are [start_date, end_date), so overlap with
     * [fromDate, toDate) means:
     *
     *   block.start_date < toDate
     *   block.end_date   > fromDate
     */
    if (data.fromDate) {
      query = query.gt("end_date", data.fromDate);
    }

    if (data.toDate) {
      query = query.lt("start_date", data.toDate);
    }

    const { data: rows, error } = await query;

    if (error) {
      throw new Error(error.message || "Could not load operational inventory blocks.");
    }

    return (
      (rows ?? []) as unknown as Array<{
        id: string;
        restaurant_id: string;

        target_kind: OperationalBlockTargetKind;

        room_id: string | null;
        room_type_id: string;
        quantity: number | null;
        group_id: string | null;

        block_type: string;
        inventory_impact: string;
        approval_required: boolean;

        status: OperationalBlockStatus;

        start_date: string;
        end_date: string;

        reason: string;
        notes: string | null;
        release_reason: string | null;

        created_by_membership_id: string;
        approved_by_membership_id: string | null;
        activated_by_membership_id: string | null;
        released_by_membership_id: string | null;
        cancelled_by_membership_id: string | null;

        created_at: string;
        updated_at: string;

        approved_at: string | null;
        activated_at: string | null;
        released_at: string | null;
        cancelled_at: string | null;
      }>
    ).map((row) => ({
      id: row.id,
      restaurantId: row.restaurant_id,

      targetKind: row.target_kind,

      roomId: row.room_id,
      roomTypeId: row.room_type_id,
      quantity: row.quantity,
      groupId: row.group_id,

      blockType: row.block_type,
      inventoryImpact: row.inventory_impact,
      approvalRequired: row.approval_required,

      status: row.status,

      startDate: row.start_date,
      endDate: row.end_date,

      reason: row.reason,
      notes: row.notes,
      releaseReason: row.release_reason,

      createdByMembershipId: row.created_by_membership_id,
      approvedByMembershipId: row.approved_by_membership_id,
      activatedByMembershipId: row.activated_by_membership_id,
      releasedByMembershipId: row.released_by_membership_id,
      cancelledByMembershipId: row.cancelled_by_membership_id,

      createdAt: row.created_at,
      updatedAt: row.updated_at,

      approvedAt: row.approved_at,
      activatedAt: row.activated_at,
      releasedAt: row.released_at,
      cancelledAt: row.cancelled_at,
    }));
  });

/* --------------------------------------------------------------- mutations */

export const createOperationalBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createBlockSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ blockId: string }> => {
    const me = await requireOperationalBlockManager(context as never, data.restaurantId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: blockId, error } = await looseRpc(supabaseAdmin).rpc(
      "pms_create_operational_block",
      {
        _restaurant_id: data.restaurantId,
        _target_kind: data.targetKind,

        _room_id: data.roomId ?? null,
        _room_type_id: data.roomTypeId,
        _quantity: data.quantity ?? null,
        _group_id: data.groupId ?? null,

        _block_type: data.blockType,

        _start_date: data.startDate,
        _end_date: data.endDate,

        _reason: data.reason,
        _notes: blankToNull(data.notes),

        _membership_id: me.id,
      },
    );

    if (error) {
      throw blockError(error, "Could not create the inventory block.");
    }

    if (!blockId || typeof blockId !== "string") {
      throw new Error("Inventory block RPC returned no block id.");
    }

    return { blockId };
  });

export const activateOperationalBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        blockId: idSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ blockId: string }> => {
    const me = await requireOperationalBlockManager(context as never, data.restaurantId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await looseRpc(supabaseAdmin).rpc("pms_activate_operational_block", {
      _restaurant_id: data.restaurantId,
      _block_id: data.blockId,
      _membership_id: me.id,
    });

    if (error) {
      throw blockError(error, "Could not activate the inventory block.");
    }

    return { blockId: data.blockId };
  });

export const approveOperationalBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        blockId: idSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ blockId: string }> => {
    const me = await requireOperationalBlockManager(context as never, data.restaurantId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await looseRpc(supabaseAdmin).rpc("pms_approve_operational_block", {
      _restaurant_id: data.restaurantId,
      _block_id: data.blockId,
      _approver_membership_id: me.id,
    });

    if (error) {
      throw blockError(error, "Could not approve the inventory block.");
    }

    return { blockId: data.blockId };
  });

export const releaseOperationalBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        blockId: idSchema,
        reason: z.string().trim().min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ blockId: string }> => {
    const me = await requireOperationalBlockManager(context as never, data.restaurantId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await looseRpc(supabaseAdmin).rpc("pms_release_operational_block", {
      _restaurant_id: data.restaurantId,
      _block_id: data.blockId,
      _membership_id: me.id,
      _release_reason: data.reason,
    });

    if (error) {
      throw blockError(error, "Could not release the inventory block.");
    }

    return { blockId: data.blockId };
  });

export const cancelOperationalBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        blockId: idSchema,
        notes: z.string().trim().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ blockId: string }> => {
    const me = await requireOperationalBlockManager(context as never, data.restaurantId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await looseRpc(supabaseAdmin).rpc("pms_cancel_operational_block", {
      _restaurant_id: data.restaurantId,
      _block_id: data.blockId,
      _membership_id: me.id,
      _notes: blankToNull(data.notes),
    });

    if (error) {
      throw blockError(error, "Could not cancel the inventory block.");
    }

    return { blockId: data.blockId };
  });

/* ----------------------------------------------------- assignment eligibility */

const evaluateRoomAssignmentSchema = z
  .object({
    restaurantId: idSchema,
    roomId: idSchema,
    roomTypeId: idSchema,
    arrival: dateSchema,
    departure: dateSchema,
    excludeReservationId: idSchema.nullable().optional(),
    adults: z.number().int().min(0).max(99).nullable().optional(),
    children: z.number().int().min(0).max(99).nullable().optional(),
    requiredBedType: z.string().trim().max(80).nullable().optional(),
    accessibleRequired: z.boolean().optional(),
    connectingRequired: z.boolean().optional(),
    preferredBuildingId: idSchema.nullable().optional(),
    preferredFloorId: idSchema.nullable().optional(),
    guestPreferenceMatched: z.boolean().optional(),
    forCheckIn: z.boolean().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.departure <= input.arrival) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["departure"],
        message: "Departure must be after arrival.",
      });
    }
  });

export const evaluateRoomAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => evaluateRoomAssignmentSchema.parse(input))
  .handler(async ({ data, context }): Promise<AssignmentEligibilityResult> => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);

    const legacyFallback = async (): Promise<AssignmentEligibilityResult> => {
      const { data: room, error: roomError } = await context.supabase
        .from("hotel_rooms")
        .select("id, status")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.roomId)
        .maybeSingle();
      if (roomError) throw new Error(roomError.message);

      let clashQuery = context.supabase
        .from("hotel_reservations")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("room_id", data.roomId)
        .in("status", ["pending", "confirmed", "checked_in"])
        .lt("arrival_date", data.departure)
        .gt("departure_date", data.arrival);
      if (data.excludeReservationId) {
        clashQuery = clashQuery.neq("id", data.excludeReservationId);
      }
      const { data: clashes, error: clashError } = await clashQuery;
      if (clashError) throw new Error(clashError.message);

      return {
        source: "legacy",
        eligible: room?.status === "available" && (clashes ?? []).length === 0,
        blockers: [],
        warnings: [],
        preferenceScore: 0,
        preferenceReasons: [],
      };
    };

    return getAssignmentEligibilityCompat(
      context.supabase,
      {
        restaurantId: data.restaurantId,
        roomId: data.roomId,
        roomTypeId: data.roomTypeId,
        arrival: data.arrival,
        departure: data.departure,
        excludeReservationId: data.excludeReservationId ?? null,
        adults: data.adults ?? null,
        children: data.children ?? null,
        requiredBedType: data.requiredBedType ?? null,
        accessibleRequired: data.accessibleRequired ?? false,
        connectingRequired: data.connectingRequired ?? false,
        preferredBuildingId: data.preferredBuildingId ?? null,
        preferredFloorId: data.preferredFloorId ?? null,
        guestPreferenceMatched: data.guestPreferenceMatched ?? false,
        forCheckIn: data.forCheckIn ?? false,
      },
      legacyFallback,
    );
  });
