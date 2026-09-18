/**
 * PMS Property Setup Card 2 — Rooms & Operations.
 *
 * Phase 0: workspace shell. Phase 1 API: Room Types & Rooms server functions
 * live in rooms.functions.ts. This module stays UI-hash/step ids only.
 */

import { SET1_HUB_HREF } from "./pms-set1-foundation.ts";
import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

export const CARD2_TITLE = "Rooms & Operations";
export const CARD2_WORKSPACE_TITLE = "Rooms & Operations";
export const CARD2_SUBTITLE =
  "Configure room types, physical rooms, amenities, housekeeping, inventory and maintenance rules.";
export const CARD2_PURPOSE = CARD2_SUBTITLE;
export const CARD2_HASH = "rooms-inventory";
export const CARD2_HREF = `${SET1_HUB_HREF}#${CARD2_HASH}`;
export const CARD2_SIDEBAR_OUT =
  "Card 2 uses full-screen PMS top-nav chrome. The old Settings left sidebar is out.";

export const CARD2_STEPS = [
  {
    id: "room-types",
    number: 1,
    title: "Room Types & Rooms",
    placeholder: "Room Types & Rooms configuration will be implemented in Phase 1.",
  },
  {
    id: "amenities",
    number: 2,
    title: "Amenities",
    placeholder: "Amenities configuration is available in this Card 2 step.",
  },
  {
    id: "housekeeping",
    number: 3,
    title: "Housekeeping",
    placeholder: "Housekeeping configuration will be implemented in a later phase.",
  },
  {
    id: "inventory-rules",
    number: 4,
    title: "Inventory Rules",
    placeholder: "Inventory Rules configuration will be implemented in a later phase.",
  },
  {
    id: "maintenance",
    number: 5,
    title: "Maintenance",
    placeholder: "Maintenance configuration will be implemented in a later phase.",
  },
] as const;

export type Card2StepId = (typeof CARD2_STEPS)[number]["id"];

export function card2StepById(step: Card2StepId) {
  return CARD2_STEPS.find((row) => row.id === step) ?? CARD2_STEPS[0];
}

export function nextCard2Step(step: Card2StepId): Card2StepId | null {
  const index = CARD2_STEPS.findIndex((row) => row.id === step);
  if (index < 0 || index >= CARD2_STEPS.length - 1) return null;
  return CARD2_STEPS[index + 1]?.id ?? null;
}

export function previousCard2Step(step: Card2StepId): Card2StepId | null {
  const index = CARD2_STEPS.findIndex((row) => row.id === step);
  if (index <= 0) return null;
  return CARD2_STEPS[index - 1]?.id ?? null;
}

export function evaluateCard2StepStatus(
  _step: Card2StepId,
  stored: PropertySetupCardStatus | undefined,
): PropertySetupCardStatus {
  if (stored === "complete" || stored === "in_progress") return stored;
  return "not_started";
}

export function card2CompletedCount(stepStatuses: Partial<Record<Card2StepId, PropertySetupCardStatus>>): number {
  return CARD2_STEPS.filter((row) => evaluateCard2StepStatus(row.id, stepStatuses[row.id]) === "complete").length;
}

export function card2ProgressPct(stepStatuses: Partial<Record<Card2StepId, PropertySetupCardStatus>>): number {
  return Math.round((card2CompletedCount(stepStatuses) / CARD2_STEPS.length) * 100);
}

export function resolveCard2Hash(hash: string): typeof CARD2_HASH | null {
  const raw = hash.replace(/^#/, "");
  if (raw === CARD2_HASH || raw === "card-2" || raw === "card2") return CARD2_HASH;
  return null;
}

export function isCard2WorkspaceHash(hash: string): boolean {
  return resolveCard2Hash(hash) !== null;
}
