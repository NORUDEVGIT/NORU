export type CashDebitNote = {
  id: string;
  noteType: string;
  totalDelta: number;
};

export type CashDebitRegistration = {
  sourceId: string;
  status: string;
  mode: string | null;
};

function roundCover(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function fiscalSnapshotMode(snapshot: unknown): "CASH" | "CREDIT" | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const mode = (snapshot as { Mode?: unknown }).Mode;
  return mode === "CASH" || mode === "CREDIT" ? mode : null;
}

/**
 * A debit note fiscally registered as CASH belongs to an invoice that was already
 * settled. Its amount is covered and must not reopen the invoice outstanding.
 */
export function registeredCashDebitCover(
  notes: readonly CashDebitNote[],
  registrations: readonly CashDebitRegistration[],
): number {
  const coveredIds = new Set(
    registrations
      .filter((row) => row.status === "REGISTERED" && row.mode === "CASH")
      .map((row) => row.sourceId),
  );
  return roundCover(
    notes.reduce((sum, note) => {
      if (note.noteType !== "debit" || !(note.totalDelta > 0) || !coveredIds.has(note.id)) {
        return sum;
      }
      return sum + note.totalDelta;
    }, 0),
  );
}
