import { MANAGE_ROLES } from "@/core/lib/workforce.server";

export const CHECK_IN_WAIVER_REQUIREMENTS = ["registration", "deposit", "key"] as const;

export type CheckInWaiverRequirement = (typeof CHECK_IN_WAIVER_REQUIREMENTS)[number];

const WAIVABLE = new Set<string>(CHECK_IN_WAIVER_REQUIREMENTS);

export function assertCheckInWaiverRole(role: string): void {
  if (!(MANAGE_ROLES as readonly string[]).includes(role)) {
    throw new Error("You don't have permission to waive check-in requirements.");
  }
}

/** Registration completeness, deposit, and key only. Other requirements stay blocked. */
export function checkInWaiverPatch(
  requirement: string,
  reason: string,
  actorId: string,
  at: string,
): Record<string, unknown> {
  if (!WAIVABLE.has(requirement)) {
    throw new Error("That requirement cannot be waived.");
  }
  if (requirement === "registration") {
    return {
      registration_waived: true,
      registration_waiver_reason: reason,
      registration_waived_by: actorId,
      registration_waived_at: at,
    };
  }
  if (requirement === "deposit") {
    return {
      deposit_waived: true,
      deposit_waiver_reason: reason,
      deposit_waived_by: actorId,
      deposit_waived_at: at,
    };
  }
  return {
    key_waived: true,
    key_waiver_reason: reason,
    key_waived_by: actorId,
    key_waived_at: at,
  };
}
