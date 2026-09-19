/**
 * PMS Property Setup Card 7 — Security, Data & Reports.
 *
 * Phase 1–4 implement the four setup domains. Phase 5 integrates overall
 * readiness. Hotel roles and report mappings do not replace live STAFF_ROLES
 * authz. Import jobs are history, not a runner. Card 7 finish does not activate.
 */

import { SET1_HUB_HREF } from "./pms-set1-foundation.ts";

export const CARD7_TITLE = "Security, Data & Reports";
export const CARD7_WORKSPACE_TITLE = "Security, Data & Reports";
export const CARD7_SUBTITLE =
  "Configure access, audit, reporting and data migration.";
export const CARD7_PURPOSE =
  "Security & Roles, Audit, Reports & Analytics, Data Import & Migration.";
export const CARD7_HASH = "security-data-reports";
export const CARD7_HREF = `${SET1_HUB_HREF}#${CARD7_HASH}`;
export const CARD7_SIDEBAR_OUT =
  "Card 7 uses full-screen PMS top-nav chrome. The old Settings left sidebar is out.";
export const CARD7_PHASE0_PLACEHOLDER =
  "Configuration for this workspace will be implemented in a later phase.";
export const CARD7_PROGRAMME_CARD_ID = "sales-distribution" as const;

export const CARD7_TABS = [
  {
    id: "security-roles",
    label: "Security & Roles",
    description: "Hotel roles, permissions, data scopes and approval rules.",
  },
  {
    id: "audit",
    label: "Audit",
    description: "Audit policy, critical events, retention and sensitive-action coverage.",
  },
  {
    id: "reports-analytics",
    label: "Reports & Analytics",
    description: "Report catalogue, metric definitions, permissions and scheduled defaults.",
  },
  {
    id: "data-import-migration",
    label: "Data Import & Migration",
    description: "Controlled migration workflow, mapping, validation and history.",
  },
] as const;

export type Card7TabId = (typeof CARD7_TABS)[number]["id"];

export function isCard7WorkspaceHash(hash: string): boolean {
  const raw = hash.replace(/^#/, "");
  return raw === CARD7_HASH || raw === "card-7" || raw === "card7";
}

export function resolveCard7Hash(hash: string): typeof CARD7_HASH | null {
  return isCard7WorkspaceHash(hash) ? CARD7_HASH : null;
}

export function card7FinishActivatesProperty(): boolean {
  return false;
}
