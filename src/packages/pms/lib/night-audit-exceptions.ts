/**
 * Pure plan for night_audit_exceptions sync.
 * The source module stays authoritative: a cleared condition resolves and a returning condition reopens.
 * A legacy ignored warning stays ignored; a blocker never does.
 */

export type ExceptionSyncExisting = {
  id: string;
  exceptionType: string;
  severity: "warning" | "blocking";
  referenceId: string | null;
  message: string;
  status: "open" | "resolved" | "ignored";
};

export type ExceptionSyncDerived = {
  exceptionType: string;
  severity: "warning" | "blocking";
  referenceType: string | null;
  referenceId: string | null;
  message: string;
};

export type ExceptionSyncUpdate = {
  id: string;
  severity: "warning" | "blocking";
  message: string;
  reopen: boolean;
};

export function exceptionSyncKey(type: string, referenceId: string | null): string {
  return `${type}::${referenceId ?? ""}`;
}

export function planExceptionSync(
  existing: readonly ExceptionSyncExisting[],
  derived: readonly ExceptionSyncDerived[],
): {
  inserts: ExceptionSyncDerived[];
  updates: ExceptionSyncUpdate[];
  resolveIds: string[];
} {
  const derivedKeys = new Set(
    derived.map((row) => exceptionSyncKey(row.exceptionType, row.referenceId)),
  );
  const inserts = derived.filter(
    (row) =>
      !existing.some(
        (current) =>
          exceptionSyncKey(current.exceptionType, current.referenceId) ===
          exceptionSyncKey(row.exceptionType, row.referenceId),
      ),
  );
  const updates: ExceptionSyncUpdate[] = [];
  for (const row of derived) {
    const current = existing.find(
      (item) =>
        exceptionSyncKey(item.exceptionType, item.referenceId) ===
        exceptionSyncKey(row.exceptionType, row.referenceId),
    );
    if (!current) continue;
    const severityChanged = current.severity !== row.severity || current.message !== row.message;
    const reopen =
      current.status === "resolved" || (row.severity === "blocking" && current.status !== "open");
    if (!severityChanged && !reopen) continue;
    updates.push({
      id: current.id,
      severity: row.severity,
      message: row.message,
      reopen,
    });
  }
  const resolveIds = existing
    .filter(
      (row) =>
        row.status === "open" &&
        !derivedKeys.has(exceptionSyncKey(row.exceptionType, row.referenceId)),
    )
    .map((row) => row.id);
  return { inserts, updates, resolveIds };
}
