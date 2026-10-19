/**
 * Room-type overbooking decisions.
 * The database functions in 0167 are the booking authority.
 * This module uses the same formula for tests.
 * There is no shared property numerical allowance.
 */

export type RoomTypeOverbookingRule = {
  enabled: boolean;
  maximumOverbooking: number | null;
  percentageLimit: number | null;
};

export type RoomTypeNightState = {
  roomTypeId: string;
  physicalCapacity: number;
  demand: number;
  rule: RoomTypeOverbookingRule | null;
};

export type OverbookingFailureCode =
  | "OVERBOOKING_NOT_ALLOWED"
  | "OVERBOOKING_CONFIGURATION_INVALID"
  | "OVERBOOKING_LIMIT_REACHED";

export function roomTypeShortage(physicalCapacity: number, demand: number): number {
  return Math.max(0, demand - Math.max(0, physicalCapacity));
}

export function roomTypeOverbookingAllowance(input: {
  propertyAllowed: boolean;
  rule: RoomTypeOverbookingRule | null;
  physicalCapacity: number;
}): number {
  if (!input.propertyAllowed || !input.rule?.enabled) return 0;
  const physical = Math.max(0, Math.trunc(input.physicalCapacity));
  const maximum = input.rule.maximumOverbooking;
  const percentage = input.rule.percentageLimit;
  if (maximum == null && percentage == null) return 0;
  const percentageAllowance =
    percentage == null ? null : Math.floor((physical * percentage) / 100);
  if (maximum != null && percentageAllowance == null) return Math.max(0, maximum);
  if (maximum == null && percentageAllowance != null) return percentageAllowance;
  return Math.min(Math.max(0, maximum ?? 0), percentageAllowance ?? 0);
}

export function roomTypeOverbookingRemaining(input: {
  propertyAllowed: boolean;
  type: RoomTypeNightState;
}): number {
  const allowance = roomTypeOverbookingAllowance({
    propertyAllowed: input.propertyAllowed,
    rule: input.type.rule,
    physicalCapacity: input.type.physicalCapacity,
  });
  return Math.max(0, allowance - roomTypeShortage(input.type.physicalCapacity, input.type.demand));
}

/** Informational only. This sum is not an allowance. */
export function totalOverbookedRooms(types: Array<{ physicalCapacity: number; demand: number }>): number {
  return types.reduce(
    (sum, type) => sum + roomTypeShortage(type.physicalCapacity, type.demand),
    0,
  );
}

export function decideExplicitOverbooking(input: {
  propertyAllowed: boolean;
  nights: Array<{
    night: string;
    typesBefore: RoomTypeNightState[];
    additionalByType: Record<string, number>;
  }>;
}):
  | { ok: true }
  | { ok: false; code: OverbookingFailureCode; night: string; roomTypeId: string } {
  for (const night of input.nights) {
    for (const [roomTypeId, added] of Object.entries(night.additionalByType)) {
      if (added <= 0) continue;
      const before =
        night.typesBefore.find((type) => type.roomTypeId === roomTypeId) ?? {
          roomTypeId,
          physicalCapacity: 0,
          demand: 0,
          rule: null,
        };
      const shortageBefore = roomTypeShortage(before.physicalCapacity, before.demand);
      const shortageAfter = roomTypeShortage(before.physicalCapacity, before.demand + added);
      const additional = shortageAfter - shortageBefore;
      if (additional <= 0) continue;
      if (!input.propertyAllowed || !before.rule?.enabled) {
        return { ok: false, code: "OVERBOOKING_NOT_ALLOWED", night: night.night, roomTypeId };
      }
      if (before.rule.maximumOverbooking == null && before.rule.percentageLimit == null) {
        return {
          ok: false,
          code: "OVERBOOKING_CONFIGURATION_INVALID",
          night: night.night,
          roomTypeId,
        };
      }
      const remaining = roomTypeOverbookingRemaining({
        propertyAllowed: input.propertyAllowed,
        type: before,
      });
      if (additional > remaining) {
        return { ok: false, code: "OVERBOOKING_LIMIT_REACHED", night: night.night, roomTypeId };
      }
    }
  }
  return { ok: true };
}

/**
 * Requests are applied in order. Each request changes only its own room type.
 * A Deluxe approval cannot reduce Standard remaining allowance.
 */
export async function settleConcurrentOverbooking(input: {
  propertyAllowed: boolean;
  night: string;
  typesBefore: RoomTypeNightState[];
  requests: Array<{ roomTypeId: string; rooms: number }>;
}): Promise<Array<"accepted" | OverbookingFailureCode>> {
  let state = input.typesBefore.map((type) => ({ ...type }));
  let chain: Promise<void> = Promise.resolve();
  const results: Array<"accepted" | OverbookingFailureCode> = [];
  const tasks = input.requests.map((request, index) => {
    const run = chain.then(() => {
      const decision = decideExplicitOverbooking({
        propertyAllowed: input.propertyAllowed,
        nights: [
          {
            night: input.night,
            typesBefore: state,
            additionalByType: { [request.roomTypeId]: request.rooms },
          },
        ],
      });
      if (decision.ok) {
        state = state.map((type) =>
          type.roomTypeId === request.roomTypeId
            ? { ...type, demand: type.demand + request.rooms }
            : type,
        );
        results[index] = "accepted";
      } else {
        results[index] = decision.code;
      }
    });
    chain = run;
    return run;
  });
  await Promise.all(tasks);
  return results;
}
