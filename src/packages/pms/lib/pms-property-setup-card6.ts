/**
 * PMS Property Setup Card 6 — Connectivity & Distribution.
 *
 * Phase 1: Integrations. Phase 2: Distribution mapping. Phase 3:
 * operational sync configuration and activation inside Distribution.
 */

import { SET1_HUB_HREF } from "./pms-set1-foundation.ts";

export const CARD6_TITLE = "Connectivity & Distribution";
export const CARD6_WORKSPACE_TITLE = "Connectivity & Distribution";
export const CARD6_SUBTITLE =
  "Connect the external systems this property depends on, then map channels on Distribution.";
export const CARD6_PURPOSE = "Integrations and Distribution.";
export const CARD6_HASH = "connectivity-distribution";
export const CARD6_HREF = `${SET1_HUB_HREF}#${CARD6_HASH}`;
export const CARD6_SIDEBAR_OUT =
  "Card 6 uses full-screen PMS top-nav chrome. The old Settings left sidebar is out.";

export const CARD6_TABS = [
  { id: "integrations", label: "Integrations", available: true },
  { id: "distribution", label: "Distribution", available: true },
] as const;

export type Card6TabId = (typeof CARD6_TABS)[number]["id"];

export function isCard6WorkspaceHash(hash: string): boolean {
  const raw = hash.replace(/^#/, "");
  return raw === CARD6_HASH || raw === "card-6" || raw === "card6";
}

export function resolveCard6Hash(hash: string): typeof CARD6_HASH | null {
  return isCard6WorkspaceHash(hash) ? CARD6_HASH : null;
}
