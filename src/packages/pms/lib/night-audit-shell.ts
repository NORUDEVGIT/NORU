/** Night Audit shell. Two modes: the current End of Day, and History. Navigation only. */
import { isEndOfDayStepId, type EndOfDayStepId } from "./night-audit-steps.ts";

export const NIGHT_AUDIT_TABS = [
  { id: "current", label: "Current End of Day" },
  { id: "history", label: "History" },
] as const;

export type NightAuditTabId = (typeof NIGHT_AUDIT_TABS)[number]["id"];

export const NIGHT_AUDIT_DESK_EYEBROW = "Night Audit";
export const NIGHT_AUDIT_DESK_TITLE = "End of Day";

export const NIGHT_AUDIT_PAGE_SIZE = 10;

/** Retired tab ids from older links resolve to the current End of Day. */
export function resolveNightAuditTab(value: string | undefined | null): NightAuditTabId {
  if (value === "history" || value === "summary") return "history";
  return "current";
}

export function resolveNightAuditStep(value: string | undefined | null): EndOfDayStepId | null {
  return value && isEndOfDayStepId(value) ? value : null;
}

export type NightAuditSearch = { tab: NightAuditTabId; run?: string; step?: EndOfDayStepId };

export function nightAuditSearch(
  tab: NightAuditTabId,
  options: { run?: string | null; step?: EndOfDayStepId | null } = {},
): NightAuditSearch {
  if (tab === "history") return options.run ? { tab, run: options.run } : { tab };
  return options.step ? { tab, step: options.step } : { tab };
}

export function paginateRows<T>(rows: readonly T[], page: number): {
  page: number;
  pages: number;
  rows: T[];
} {
  const pages = Math.max(1, Math.ceil(rows.length / NIGHT_AUDIT_PAGE_SIZE));
  const current = Math.min(Math.max(page, 1), pages);
  const start = (current - 1) * NIGHT_AUDIT_PAGE_SIZE;
  return { page: current, pages, rows: rows.slice(start, start + NIGHT_AUDIT_PAGE_SIZE) };
}
