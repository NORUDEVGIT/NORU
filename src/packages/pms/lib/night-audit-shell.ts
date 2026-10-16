/** Night Audit Phase 1 shell. Tabs are navigation only. They do not add writers. */

export const NIGHT_AUDIT_TABS = [
  { id: "control", label: "Control Center" },
  { id: "pre-audit", label: "Pre-Audit" },
  { id: "reconciliation", label: "Reconciliation" },
  { id: "history", label: "History" },
] as const;

export type NightAuditTabId = (typeof NIGHT_AUDIT_TABS)[number]["id"];

export const NIGHT_AUDIT_DESK_EYEBROW = "Operations";
export const NIGHT_AUDIT_DESK_TITLE = "Night Audit Control";

export const NIGHT_AUDIT_TAB_COPY: Record<NightAuditTabId, string> = {
  control: "Review live blockers and close the current business date.",
  "pre-audit": "The same live close blockers, before confirm. This is not a second audit run.",
  reconciliation:
    "Company, group, master, city ledger, and tax reconciliation are not live. Night Audit does not invent those balances.",
  history: "Closed and open runs already stored for this property.",
};

export const NIGHT_AUDIT_PAGE_SIZE = 10;

const TAB_ALIASES: Record<string, NightAuditTabId> = {
  summary: "history",
  blockers: "control",
};

export function resolveNightAuditTab(value: string | undefined | null): NightAuditTabId {
  if (!value) return "control";
  if (NIGHT_AUDIT_TABS.some((tab) => tab.id === value)) return value as NightAuditTabId;
  return TAB_ALIASES[value] ?? "control";
}

export function nightAuditSearch(
  tab: NightAuditTabId,
  run?: string | null,
): { tab: NightAuditTabId; run?: string } {
  if (tab === "history" && run) return { tab, run };
  return { tab };
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
