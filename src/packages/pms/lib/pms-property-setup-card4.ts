/**
 * PMS Property Setup Card 4 — Guest & Services (Issue #195).
 *
 * Phase 1: Profile Types. Other Guest Profile Rules steps are placeholders.
 * Operational Guest Profiles are not configured from this card.
 */

import { SET1_HUB_HREF } from "./pms-set1-foundation.ts";
import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

export const CARD4_TITLE = "Guest & Services";
export const CARD4_WORKSPACE_TITLE = "Guest & Services";
export const CARD4_SUBTITLE = "Guest Profile Rules for this property.";
export const CARD4_PURPOSE =
  "Guest Profile Rules, Guest Service Types, Notifications & Communication.";
export const CARD4_HASH = "guest-services";
export const CARD4_HREF = `${SET1_HUB_HREF}#${CARD4_HASH}`;
export const CARD4_SIDEBAR_OUT =
  "Card 4 uses full-screen PMS top-nav chrome. The old Settings left sidebar is out.";

export const CARD4_STEPS = [
  {
    id: "profile-types",
    number: 1,
    title: "Profile Types",
    placeholder: null,
  },
  {
    id: "required-fields",
    number: 2,
    title: "Required Fields",
    placeholder: "Required Fields configuration will be implemented in a later phase.",
  },
  {
    id: "identity-documents",
    number: 3,
    title: "Identity Documents",
    placeholder: "Identity Documents configuration will be implemented in a later phase.",
  },
  {
    id: "preferences",
    number: 4,
    title: "Preferences",
    placeholder: "Preferences configuration will be implemented in a later phase.",
  },
  {
    id: "company-business",
    number: 5,
    title: "Company & Business",
    placeholder: "Company & Business configuration will be implemented in a later phase.",
  },
] as const;

export type Card4StepId = (typeof CARD4_STEPS)[number]["id"];

export function card4StepById(step: Card4StepId) {
  return CARD4_STEPS.find((row) => row.id === step) ?? CARD4_STEPS[0];
}

export function previousCard4Step(step: Card4StepId): Card4StepId | null {
  const index = CARD4_STEPS.findIndex((row) => row.id === step);
  if (index <= 0) return null;
  return CARD4_STEPS[index - 1]?.id ?? null;
}

export function nextCard4Step(step: Card4StepId): Card4StepId | null {
  const index = CARD4_STEPS.findIndex((row) => row.id === step);
  if (index < 0 || index >= CARD4_STEPS.length - 1) return null;
  return CARD4_STEPS[index + 1]?.id ?? null;
}

export function evaluateCard4StepStatus(
  step: Card4StepId,
  stored: PropertySetupCardStatus | undefined,
  profileTypesConfigured: boolean,
): PropertySetupCardStatus {
  if (step === "profile-types") {
    if (profileTypesConfigured) return "complete";
    if (stored === "in_progress" || stored === "complete") return stored;
    return "not_started";
  }
  if (stored === "complete" || stored === "in_progress") return stored;
  return "not_started";
}

export function card4CompletedCount(
  stepStatuses: Partial<Record<Card4StepId, PropertySetupCardStatus>>,
): number {
  return CARD4_STEPS.filter((row) => stepStatuses[row.id] === "complete").length;
}

export function card4ProgressPct(completed: number): number {
  return Math.round((completed / CARD4_STEPS.length) * 100);
}

export function isCard4WorkspaceHash(hash: string): boolean {
  const raw = hash.replace(/^#/, "");
  return raw === CARD4_HASH || raw === "card-4" || raw === "card4";
}

export function resolveCard4Hash(hash: string): typeof CARD4_HASH | null {
  return isCard4WorkspaceHash(hash) ? CARD4_HASH : null;
}
