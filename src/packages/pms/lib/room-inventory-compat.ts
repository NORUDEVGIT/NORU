export type RpcErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export type UntypedRpcClient = {
  rpc: (
    functionName: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcErrorLike | null }>;
};

export interface RoomTypeAvailabilityInput {
  restaurantId: string;
  roomTypeId: string;
  arrival: string;
  departure: string;
  excludeReservationId?: string | null;
}

export interface CanonicalRoomTypeAvailability {
  source: "canonical" | "legacy";
  roomTypeId: string;
  physicalCapacity: number;
  available: number;
  reserved: number | null;
  businessDate: string | null;
  limitingDate: string | null;
  overbookingAllowance: 0;
  nightly: unknown[];
}

export interface AssignmentEligibilityInput extends RoomTypeAvailabilityInput {
  roomId: string;
  adults?: number | null;
  children?: number | null;
  requiredBedType?: string | null;
  accessibleRequired?: boolean;
  connectingRequired?: boolean;
  preferredBuildingId?: string | null;
  preferredFloorId?: string | null;
  guestPreferenceMatched?: boolean;
  forCheckIn?: boolean;
}

export type AssignmentEligibilityNote = Record<string, string | number | boolean | null>;

export interface AssignmentEligibilityResult {
  source: "canonical" | "legacy";
  eligible: boolean;
  blockers: AssignmentEligibilityNote[];
  warnings: AssignmentEligibilityNote[];
  preferenceScore: number;
  preferenceReasons: string[];
}

export interface OperationalRestrictionInput {
  restaurantId: string;
  roomId: string;
  status: "available" | "out_of_order" | "out_of_service";
  reason?: string | null;
  expectedReturn?: string | null;
  membershipId: string;
  maintenanceRequestId?: string | null;
  approverMembershipId?: string | null;
  reopeningInspectionId?: string | null;
}

export interface OperationalRestrictionResult {
  source: "canonical" | "legacy";
}

export const OPERATIONAL_RESTRICTION_CAPABILITY_REQUIRED =
  "The approved operational restriction service must be applied before ticket, approval, or reopening-inspection requirements can be used.";

function errorText(error: RpcErrorLike): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(" ");
}

/**
 * PostgREST reports a missing cached RPC as PGRST202. PostgreSQL itself uses
 * 42883 for an undefined function. The function name check prevents unrelated
 * schema-cache or SQL errors from silently selecting the legacy algorithm.
 */
export function isMissingRpcFunction(error: RpcErrorLike | null, functionName: string): boolean {
  if (!error) return false;
  if (error.code !== "PGRST202" && error.code !== "42883") return false;
  const normalizedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:public\\.)?${normalizedName}`, "i").test(errorText(error));
}

function rpcError(error: RpcErrorLike, fallback: string): Error {
  const text = [error.code, error.message || error.details || fallback].filter(Boolean).join(" ");
  return new Error(text);
}

const WRAPPED_RPC_KEYS = new Set(["pms_evaluate_room_assignment", "pms_room_type_availability"]);

/**
 * PostgREST may return jsonb as an object, a one-row array, a JSON string,
 * or a `{ function_name: payload }` wrapper. Eligibility keys must still be
 * read from the payload — a wrapper without `eligible` must not look like a
 * successful "not eligible" result.
 */
export function coerceRpcRow(data: unknown): Record<string, unknown> | null {
  let value: unknown = data;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? null : coerceRpcRow(value[0]);
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 1 && WRAPPED_RPC_KEYS.has(keys[0] ?? "")) {
    return coerceRpcRow(record[keys[0] ?? ""]);
  }
  return record;
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function eligibilityNotes(value: unknown): AssignmentEligibilityNote[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return {};
    const note: AssignmentEligibilityNote = {};
    for (const [key, item] of Object.entries(entry)) {
      if (
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean" ||
        item === null
      ) {
        note[key] = item;
      }
    }
    return note;
  });
}

export async function getRoomTypeAvailabilityCompat(
  client: unknown,
  input: RoomTypeAvailabilityInput,
): Promise<CanonicalRoomTypeAvailability> {
  const rpc = client as UntypedRpcClient;
  const modern = await rpc.rpc("pms_room_type_availability", {
    _restaurant_id: input.restaurantId,
    _room_type_id: input.roomTypeId,
    _arrival: input.arrival,
    _departure: input.departure,
    _exclude_reservation_id: input.excludeReservationId ?? null,
  });

  if (!modern.error) {
    const row = coerceRpcRow(modern.data);
    if (!row) throw new Error("Availability RPC returned no result.");
    return {
      source: "canonical",
      roomTypeId: String(row["room_type_id"] ?? input.roomTypeId),
      physicalCapacity: numberValue(row["physical_capacity"]),
      available: Math.max(0, numberValue(row["available"])),
      reserved: null,
      businessDate: typeof row["business_date"] === "string" ? row["business_date"] : null,
      limitingDate: typeof row["limiting_date"] === "string" ? row["limiting_date"] : null,
      overbookingAllowance: numberValue(row["overbooking_allowance"]),
      nightly: Array.isArray(row["nightly"]) ? row["nightly"] : [],
    };
  }

  if (!isMissingRpcFunction(modern.error, "pms_room_type_availability")) {
    throw rpcError(modern.error, "Could not load room availability.");
  }

  const [totalResult, reservedResult] = await Promise.all([
    rpc.rpc("count_sellable_rooms", {
      _restaurant_id: input.restaurantId,
      _room_type_id: input.roomTypeId,
    }),
    rpc.rpc("count_reserved_rooms", {
      _restaurant_id: input.restaurantId,
      _room_type_id: input.roomTypeId,
      _arrival: input.arrival,
      _departure: input.departure,
      _exclude_reservation_id: input.excludeReservationId ?? null,
    }),
  ]);

  if (totalResult.error) {
    throw rpcError(totalResult.error, "Could not count sellable rooms.");
  }
  if (reservedResult.error) {
    throw rpcError(reservedResult.error, "Could not count reserved rooms.");
  }

  const physicalCapacity = numberValue(totalResult.data);
  const reserved = numberValue(reservedResult.data);
  return {
    source: "legacy",
    roomTypeId: input.roomTypeId,
    physicalCapacity,
    available: Math.max(0, physicalCapacity - reserved),
    reserved,
    businessDate: null,
    limitingDate: null,
    overbookingAllowance: 0,
    nightly: [],
  };
}

export async function getAssignmentEligibilityCompat(
  client: unknown,
  input: AssignmentEligibilityInput,
  legacyFallback: () => AssignmentEligibilityResult | Promise<AssignmentEligibilityResult>,
): Promise<AssignmentEligibilityResult> {
  const rpc = client as UntypedRpcClient;
  const modern = await rpc.rpc("pms_evaluate_room_assignment", {
    _restaurant_id: input.restaurantId,
    _room_id: input.roomId,
    _room_type_id: input.roomTypeId,
    _arrival: input.arrival,
    _departure: input.departure,
    _exclude_reservation_id: input.excludeReservationId ?? null,
    _adults: input.adults ?? null,
    _children: input.children ?? null,
    _required_bed_type: input.requiredBedType ?? null,
    _accessible_required: input.accessibleRequired ?? false,
    _connecting_required: input.connectingRequired ?? false,
    _preferred_building_id: input.preferredBuildingId ?? null,
    _preferred_floor_id: input.preferredFloorId ?? null,
    _guest_preference_matched: input.guestPreferenceMatched ?? false,
    _for_check_in: input.forCheckIn ?? false,
  });

  if (!modern.error) {
    const row = coerceRpcRow(modern.data);
    if (!row || !("eligible" in row)) {
      const preview =
        modern.data && typeof modern.data === "object"
          ? Object.keys(modern.data as object).join(",")
          : typeof modern.data;
      throw new Error(`Assignment eligibility RPC returned no result (${preview}).`);
    }
    return {
      source: "canonical",
      eligible: row["eligible"] === true,
      blockers: eligibilityNotes(row["blockers"]),
      warnings: eligibilityNotes(row["warnings"]),
      preferenceScore: numberValue(row["preferenceScore"]),
      preferenceReasons: Array.isArray(row["preferenceReasons"])
        ? row["preferenceReasons"].map(String)
        : [],
    };
  }

  if (!isMissingRpcFunction(modern.error, "pms_evaluate_room_assignment")) {
    throw rpcError(modern.error, "Could not evaluate room assignment.");
  }

  return legacyFallback();
}

function hasAdvancedRestrictionInput(input: OperationalRestrictionInput): boolean {
  return Boolean(
    input.maintenanceRequestId || input.approverMembershipId || input.reopeningInspectionId,
  );
}

export async function setOperationalRestrictionCompat(
  client: unknown,
  input: OperationalRestrictionInput,
): Promise<OperationalRestrictionResult> {
  const rpc = client as UntypedRpcClient;
  const modern = await rpc.rpc("pms_set_room_operational_restriction", {
    _restaurant_id: input.restaurantId,
    _room_id: input.roomId,
    _status: input.status,
    _reason: input.reason ?? null,
    _expected_return: input.expectedReturn ?? null,
    _membership_id: input.membershipId,
    _maintenance_request_id: input.maintenanceRequestId ?? null,
    _approver_membership_id: input.approverMembershipId ?? null,
    _reopening_inspection_id: input.reopeningInspectionId ?? null,
  });

  if (!modern.error) return { source: "canonical" };
  if (!isMissingRpcFunction(modern.error, "pms_set_room_operational_restriction")) {
    throw rpcError(modern.error, "Could not update the room restriction.");
  }
  if (hasAdvancedRestrictionInput(input)) {
    throw new Error(OPERATIONAL_RESTRICTION_CAPABILITY_REQUIRED);
  }

  const legacy = await rpc.rpc("housekeeping_set_room_restriction", {
    _restaurant_id: input.restaurantId,
    _room_id: input.roomId,
    _status: input.status,
    _reason: input.reason ?? null,
    _expected_return: input.expectedReturn ?? null,
    _membership_id: input.membershipId,
  });
  if (legacy.error) {
    throw rpcError(legacy.error, "Could not update the room restriction.");
  }
  return { source: "legacy" };
}

const OPERATIONAL_ROOM_FIELDS = new Set([
  "status",
  "restriction_reason",
  "restriction_expected_return",
  "restriction_maintenance_request_id",
  "restriction_placed_at",
  "restriction_placed_by_membership_id",
  "restriction_approved_by_membership_id",
]);

export function roomPersistencePayload(
  input: Record<string, unknown>,
  mode: "create" | "update",
): Record<string, unknown> {
  const output = Object.fromEntries(
    Object.entries(input).filter(([key]) => !OPERATIONAL_ROOM_FIELDS.has(key)),
  );
  if (mode === "create") output["status"] = "available";
  return output;
}
