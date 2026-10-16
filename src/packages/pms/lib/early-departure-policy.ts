/**
 * Early departure penalty values match pms_no_show_policies.penalty_type:
 * none, first_night, percent_stay, fixed_amount, full_stay.
 * full_stay is the catalogue token for a full-stay charge.
 */
export const EARLY_DEPARTURE_PENALTY_TYPES = [
  "none",
  "first_night",
  "percent_stay",
  "fixed_amount",
  "full_stay",
] as const;

export type EarlyDeparturePenaltyType = (typeof EARLY_DEPARTURE_PENALTY_TYPES)[number];

export const EARLY_DEPARTURE_PENALTY_TYPE_LABELS: Record<EarlyDeparturePenaltyType, string> = {
  none: "No charge",
  first_night: "First night",
  percent_stay: "Percentage of stay",
  fixed_amount: "Fixed amount",
  full_stay: "Full stay",
};

const VALUE_FREE: ReadonlySet<EarlyDeparturePenaltyType> = new Set([
  "none",
  "first_night",
  "full_stay",
]);

export function resolvedEarlyDeparturePenaltyValue(
  penaltyType: EarlyDeparturePenaltyType,
  penaltyValue: number,
): { ok: true; penaltyValue: number } | { ok: false; message: string } {
  if (VALUE_FREE.has(penaltyType)) return { ok: true, penaltyValue: 0 };
  if (!Number.isFinite(penaltyValue) || penaltyValue <= 0) {
    return { ok: false, message: "Enter a penalty value." };
  }
  if (penaltyType === "percent_stay" && penaltyValue > 100) {
    return { ok: false, message: "Percentage cannot exceed 100." };
  }
  return { ok: true, penaltyValue };
}

/** Catalogue row used to freeze terms onto a reservation. */
export type EarlyDeparturePolicyMaster = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  penaltyType: string;
  penaltyValue: number;
};

/** Historical early-departure terms. Later master edits do not rewrite this object. */
export type EarlyDeparturePolicySnapshot = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  penalty_type: EarlyDeparturePenaltyType;
  penalty_value: number;
};

export function buildEarlyDeparturePolicySnapshot(
  policy: EarlyDeparturePolicyMaster,
): EarlyDeparturePolicySnapshot {
  const penaltyType = EARLY_DEPARTURE_PENALTY_TYPES.find((value) => value === policy.penaltyType);
  if (!penaltyType) {
    throw new Error("The rate plan early departure policy has an unsupported penalty type.");
  }
  const description = policy.description?.trim() ?? "";
  return {
    id: policy.id,
    code: policy.code,
    name: policy.name,
    description: description ? description : null,
    penalty_type: penaltyType,
    penalty_value: Number(policy.penaltyValue),
  };
}

export function earlyDeparturePenaltySummary(
  penaltyType: string | null | undefined,
  penaltyValue: number | string | null | undefined,
): string | null {
  const type = EARLY_DEPARTURE_PENALTY_TYPES.find((value) => value === penaltyType);
  if (!type) return null;
  if (type === "percent_stay") {
    const value = Number(penaltyValue);
    return Number.isFinite(value)
      ? `${value}% of stay`
      : EARLY_DEPARTURE_PENALTY_TYPE_LABELS.percent_stay;
  }
  if (type === "fixed_amount") {
    const value = Number(penaltyValue);
    return Number.isFinite(value)
      ? `Fixed amount ${value}`
      : EARLY_DEPARTURE_PENALTY_TYPE_LABELS.fixed_amount;
  }
  return EARLY_DEPARTURE_PENALTY_TYPE_LABELS[type];
}

export function earlyDepartureReviewLabel(input: {
  name?: string | null;
  penaltyType?: string | null;
  penaltyValue?: number | string | null;
  description?: string | null;
}): string {
  const name = input.name?.trim() ?? "";
  if (!name) return "Not configured";
  const penalty = earlyDeparturePenaltySummary(input.penaltyType, input.penaltyValue);
  const description = input.description?.trim() ?? "";
  return [name, penalty, description].filter(Boolean).join(" · ");
}

function legacyRefundabilityEarlyDeparture(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  for (const key of ["early_departure", "early_departure_policy"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Dedicated snapshot is authoritative when present.
 * Refundability keys are used only when the snapshot column is empty.
 */
export function earlyDepartureReservationLabel(input: {
  snapshot: unknown;
  legacyRefundabilitySnapshot?: unknown;
}): string | null {
  if (input.snapshot && typeof input.snapshot === "object" && !Array.isArray(input.snapshot)) {
    const row = input.snapshot as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const penalty = earlyDeparturePenaltySummary(
      typeof row.penalty_type === "string" ? row.penalty_type : null,
      typeof row.penalty_value === "number" || typeof row.penalty_value === "string"
        ? row.penalty_value
        : null,
    );
    const description = typeof row.description === "string" ? row.description.trim() : "";
    const parts = [name, penalty, description].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  return legacyRefundabilityEarlyDeparture(input.legacyRefundabilitySnapshot);
}
