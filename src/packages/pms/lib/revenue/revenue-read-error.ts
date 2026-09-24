/** Generic UI copy for core Rate & Revenue read failures. Do not surface raw DB grants. */
export const REVENUE_CONFIG_LOAD_ERROR = "Revenue configuration could not be loaded.";
export const REVENUE_CONTROL_LOAD_ERROR = "Revenue Control could not load.";
export const RATE_CALENDAR_LOAD_ERROR = "Rate Calendar could not load.";

export function isPrivilegedDbError(message: string): boolean {
  return /permission denied|row-level security|42501/i.test(message);
}

export function toRevenueReadError(
  error: unknown,
  fallback = REVENUE_CONFIG_LOAD_ERROR,
): Error {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (isPrivilegedDbError(message)) {
    console.error("[revenue-read]", message);
    return new Error(fallback);
  }
  return error instanceof Error ? error : new Error(message || fallback);
}

export function revenueUiError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message || isPrivilegedDbError(message)) return fallback;
  return message;
}
