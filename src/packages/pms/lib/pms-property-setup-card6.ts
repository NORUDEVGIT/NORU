/**
 * PMS Property Setup Card 6 — Connectivity & Distribution.
 *
 * Phase 1 ships the Integrations tab. Distribution stays a visible but
 * inactive placeholder; its mapping and rules work is Phase 2 and lives with
 * the existing distribution_channels model, not with connector metadata.
 */

import { SET1_HUB_HREF } from "./pms-set1-foundation.ts";

export const CARD6_TITLE = "Connectivity & Distribution";
export const CARD6_WORKSPACE_TITLE = "Connectivity & Distribution";
export const CARD6_SUBTITLE =
  "Connect the external systems this property depends on, and prepare for channel distribution.";
export const CARD6_PURPOSE = "Integrations and Distribution.";
export const CARD6_HASH = "connectivity-distribution";
export const CARD6_HREF = `${SET1_HUB_HREF}#${CARD6_HASH}`;
export const CARD6_SIDEBAR_OUT =
  "Card 6 uses full-screen PMS top-nav chrome. The old Settings left sidebar is out.";

export const CARD6_TABS = [
  { id: "integrations", label: "Integrations", available: true },
  { id: "distribution", label: "Distribution", available: false },
] as const;

export type Card6TabId = (typeof CARD6_TABS)[number]["id"];

export const CARD6_DISTRIBUTION_PLACEHOLDER_TITLE = "Distribution is not configured here yet";
export const CARD6_DISTRIBUTION_PLACEHOLDER_BODY =
  "Channel mapping, rate and inventory distribution rules, and the activation workflow arrive in Phase 2. Nothing on this tab is active.";

export function isCard6WorkspaceHash(hash: string): boolean {
  const raw = hash.replace(/^#/, "");
  return raw === CARD6_HASH || raw === "card-6" || raw === "card6";
}

export function resolveCard6Hash(hash: string): typeof CARD6_HASH | null {
  return isCard6WorkspaceHash(hash) ? CARD6_HASH : null;
}
