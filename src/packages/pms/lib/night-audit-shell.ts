/** Night Audit shell. Tabs navigate. They do not post, allocate, or close a drawer. */

export const NIGHT_AUDIT_TABS = [
  { id: "control", label: "Control Center" },
  { id: "financial", label: "Financial" },
  { id: "operations", label: "Operations" },
  { id: "exceptions", label: "Exceptions" },
  { id: "close", label: "Run & Close" },
  { id: "history", label: "History" },
] as const;

export type NightAuditTabId = (typeof NIGHT_AUDIT_TABS)[number]["id"];

export const NIGHT_AUDIT_DESK_EYEBROW = "Operations";
export const NIGHT_AUDIT_DESK_TITLE = "Night Audit Control";

export const NIGHT_AUDIT_TAB_COPY: Record<NightAuditTabId, string> = {
  control: "",
  financial: "",
  operations: "",
  exceptions: "",
  close: "",
  history: "",
};

export const NIGHT_AUDIT_PAGE_SIZE = 10;

const TAB_ALIASES: Record<string, NightAuditTabId> = {
  summary: "history",
  blockers: "control",
  reconciliation: "financial",
  "pre-audit": "operations",
  run: "close",
};

export function resolveNightAuditTab(value: string | undefined | null): NightAuditTabId {
  if (!value) return "control";
  if (NIGHT_AUDIT_TABS.some((tab) => tab.id === value)) return value as NightAuditTabId;
  return TAB_ALIASES[value] ?? "control";
}

export function nightAuditSearch(
  tab: NightAuditTabId,
  run?: string | null,
  focus?: string | null,
): { tab: NightAuditTabId; run?: string; focus?: string } {
  if (tab === "history" && run) return { tab, run };
  if ((tab === "financial" || tab === "operations" || tab === "exceptions") && focus) return { tab, focus };
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
