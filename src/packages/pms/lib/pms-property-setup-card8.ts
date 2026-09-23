/** PMS Property Setup Card 8 — Phase 5 integrated System & Go-Live readiness. */

import { SET1_HUB_HREF } from "./pms-set1-foundation.ts";

export const CARD8_TITLE = "System & Go-Live";
export const CARD8_WORKSPACE_TITLE = "System & Go-Live";
export const CARD8_SUBTITLE =
  "Review final system readiness, launch governance and property activation.";
export const CARD8_PURPOSE = "Offline & Sync, System Validation, Go-Live, Property Activation.";
export const CARD8_HASH = "system-go-live";
export const CARD8_HREF = `${SET1_HUB_HREF}#${CARD8_HASH}`;
export const CARD8_PROGRAMME_CARD_ID = "payments-administration" as const;
export const CARD8_SIDEBAR_OUT =
  "Card 8 uses full-screen PMS top-nav chrome. The old Settings left sidebar is out.";
export const CARD8_PHASE0_PLACEHOLDER =
  "Phase 0 provides the launch workspace shell only. No validation, go-live or activation action runs here.";
export const CARD8_OFFLINE_HONESTY =
  "Configuration here defines policy only. NORU does not currently provide the offline runtime engine. SET6 settings are legacy intent and must never read Offline Ready.";
export const CARD8_VALIDATION_HONESTY =
  "System Validation wraps Cards 1–7 live evaluators read-only. Results are not persisted; there is no validation history or fabricated count.";
export const CARD8_GOLIVE_HONESTY =
  "Go-Live persists governance only. Sandbox is unavailable and cutover lock is unenforced; both limitations require acknowledgement. Activation remains explicit.";
export const CARD8_ACTIVATION_HONESTY =
  "Canonical activation remains owner-only activatePmsSet1 / pms_set1_live. Every entry point now enforces the same Card 8 gates; no second activation mutation or live flag exists.";

export const CARD8_TABS = [
  {
    id: "offline-sync",
    label: "Offline & Sync",
    description: CARD8_OFFLINE_HONESTY,
  },
  {
    id: "system-validation",
    label: "System Validation",
    description: CARD8_VALIDATION_HONESTY,
  },
  {
    id: "go-live",
    label: "Go-Live",
    description: CARD8_GOLIVE_HONESTY,
  },
  {
    id: "property-activation",
    label: "Property Activation",
    description: CARD8_ACTIVATION_HONESTY,
  },
] as const;

export type Card8TabId = (typeof CARD8_TABS)[number]["id"];

export function isCard8WorkspaceHash(hash: string): boolean {
  const raw = hash.replace(/^#/, "");
  return raw === CARD8_HASH || raw === "card-8" || raw === "card8";
}

export function resolveCard8Hash(hash: string): typeof CARD8_HASH | null {
  return isCard8WorkspaceHash(hash) ? CARD8_HASH : null;
}

export function card8FinishActivatesProperty(): boolean {
  return false;
}
