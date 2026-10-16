export interface ReservationHistoryChange {
  key: string;
  from: string;
  to: string;
}

function formatHistoryScalar(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function reservationHistoryChanges(
  previousValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
): ReservationHistoryChange[] {
  const prev = previousValues ?? {};
  const next = newValues ?? {};
  const keys = [...new Set([...Object.keys(prev), ...Object.keys(next)])].sort();
  return keys
    .filter((key) => JSON.stringify(prev[key] ?? null) !== JSON.stringify(next[key] ?? null))
    .map((key) => ({
      key,
      from: formatHistoryScalar(prev[key]),
      to: formatHistoryScalar(next[key]),
    }));
}
