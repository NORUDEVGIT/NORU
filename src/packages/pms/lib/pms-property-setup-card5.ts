/**
 * PMS Property Setup Card 5 — Organization & Facilities.
 *
 * Phase 0 exposes the shared workspace shell only. Department, facility, and
 * Sales & Events configuration remain intentionally unavailable.
 */

import { SET1_HUB_HREF } from "./pms-set1-foundation.ts";

export const CARD5_TITLE = "Organization & Facilities";
export const CARD5_WORKSPACE_TITLE = "Organization & Facilities";
export const CARD5_SUBTITLE =
  "Configure organizational units, facilities and sales/event master settings.";
export const CARD5_PURPOSE = "Departments, Outlets & Facilities, Sales & Events.";
export const CARD5_HASH = "organization-facilities";
export const CARD5_HREF = `${SET1_HUB_HREF}#${CARD5_HASH}`;
export const CARD5_SIDEBAR_OUT =
  "Card 5 uses full-screen PMS top-nav chrome. The old Settings left sidebar is out.";
export const CARD5_PHASE0_PLACEHOLDER =
  "Configuration for this workspace will be implemented in a later phase.";

export const CARD5_TABS = [
  {
    id: "departments",
    label: "Departments",
    description: "Department structure, responsibilities, routing and defaults.",
  },
  {
    id: "outlets-facilities",
    label: "Outlets & Facilities",
    description: "Physical and commercial facilities within the property.",
  },
  {
    id: "sales-events",
    label: "Sales & Events",
    description: "Sales and event master configuration only.",
  },
] as const;

export type Card5TabId = (typeof CARD5_TABS)[number]["id"];

export function isCard5WorkspaceHash(hash: string): boolean {
  const raw = hash.replace(/^#/, "");
  return raw === CARD5_HASH || raw === "card-5" || raw === "card5";
}

export function resolveCard5Hash(hash: string): typeof CARD5_HASH | null {
  return isCard5WorkspaceHash(hash) ? CARD5_HASH : null;
}

export const CARD5_PROGRAMME_CARD_ID = "departments-services" as const;

export function card5FinishActivatesProperty(): boolean {
  return false;
}
