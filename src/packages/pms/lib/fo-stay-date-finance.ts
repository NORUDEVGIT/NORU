/**
 * In-house stay-date financial display.
 * The quoted amount comes from price_hotel_stay. This file does not price a stay
 * and does not post a folio line.
 */
export type StayDateChangeKind = "extend" | "early_departure" | "dates_changed";

export function stayNights(arrival: string, departure: string): number {
  const start = Date.parse(`${arrival}T00:00:00Z`);
  const end = Date.parse(`${departure}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 86_400_000);
}

/** More nights is an extension. Fewer nights is an early departure. Same nights is a date shift. */
export function stayDateChangeKind(
  previousArrival: string,
  previousDeparture: string,
  nextArrival: string,
  nextDeparture: string,
): StayDateChangeKind {
  const previous = stayNights(previousArrival, previousDeparture);
  const next = stayNights(nextArrival, nextDeparture);
  if (next > previous) return "extend";
  if (next < previous) return "early_departure";
  return "dates_changed";
}

export function stayDateConfirmationTitle(kind: StayDateChangeKind): string {
  if (kind === "extend") return "Extend Stay";
  if (kind === "early_departure") return "Early Departure";
  return "Change Stay Dates";
}

/** Count label. One night stays singular. */
export function stayNightLabel(nights: number): string {
  const count = Math.abs(Math.trunc(nights));
  return `${count} ${count === 1 ? "night" : "nights"}`;
}

export function extensionSummary(previousNights: number, nextNights: number): string | null {
  const delta = nextNights - previousNights;
  if (delta <= 0) return null;
  return `Extension: +${stayNightLabel(delta)}`;
}

/** Difference of two quoted totals. This does not price a night. */
export function authoritativeRoomChargeDelta(current: number, quoted: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(quoted)) return null;
  return Math.round((quoted - current) * 100) / 100;
}

export function earlyDeparturePenaltyType(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return "none";
  const value = (snapshot as { penalty_type?: unknown }).penalty_type;
  return typeof value === "string" && value.trim() ? value.trim() : "none";
}

export function earlyDeparturePolicyLine(snapshot: unknown): string {
  const type = earlyDeparturePenaltyType(snapshot);
  if (type === "none") return "No early-departure penalty is configured for this stay.";
  const name =
    snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
      ? String((snapshot as { name?: unknown }).name ?? "").trim()
      : "";
  const label = name ? `${name} (${type})` : type;
  return `Early-departure policy: ${label}. This action does not post that penalty as a separate folio charge.`;
}

/**
 * Posted room charge is corrected by reconcile_reservation_unit_room_charge.
 * A penalty snapshot is not a second charge. Deposit money is left on the folio.
 */
export function stayDateFolioImpact(kind: StayDateChangeKind, penaltyType: string): string[] {
  const lines = [
    "The new room price comes from the rate plan for these dates.",
    "If this room already has a posted room charge on an open folio, that charge is reversed and the new room amount is posted.",
    "A closed or invoiced folio blocks the change. Deposit money is not refunded here.",
  ];
  if (kind === "early_departure") {
    lines.push(
      penaltyType === "none"
        ? "No early-departure penalty is configured, so none is posted."
        : "The early-departure penalty stays on the reservation. It is not posted as its own folio charge.",
    );
  }
  return lines;
}
