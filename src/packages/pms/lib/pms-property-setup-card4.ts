/**
 * PMS Property Setup Card 4 — Guest & Services (Issue #195).
 *
 * Guest Profile Rules (phases 1–5) plus Guest Service Types (categories and types).
 * Operational Guest Profiles and Guest Services requests are not configured here.
 */

import { SET1_HUB_HREF } from "./pms-set1-foundation.ts";
import type { PropertySetupCardStatus } from "./pms-property-setup-card1.ts";

export const CARD4_TITLE = "Guest & Services";
export const CARD4_WORKSPACE_TITLE = "Guest & Services";
export const CARD4_SUBTITLE = "Guest profile rules, guest service types, and notifications.";
export const CARD4_GPR_SUBTITLE = "Guest Profile Rules for this property.";
export const CARD4_GST_SUBTITLE = "Organize guest services into categories for easier management.";
export const CARD4_NOTIFY_SUBTITLE =
  "Notifications & Communication configuration will be implemented in a later phase.";
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
    placeholder: null,
  },
  {
    id: "identity-documents",
    number: 3,
    title: "Identity Documents",
    placeholder: null,
  },
  {
    id: "preferences",
    number: 4,
    title: "Preferences",
    placeholder: null,
  },
  {
    id: "company-business",
    number: 5,
    title: "Company & Business",
    placeholder: null,
  },
] as const;

export type Card4StepId = (typeof CARD4_STEPS)[number]["id"];

export const CARD4_MAIN_SECTIONS = [
  { id: "profile-rules", title: "Guest Profile Rules" },
  { id: "guest-service-types", title: "Guest Service Types" },
  { id: "notifications", title: "Notifications & Communication" },
] as const;

export type Card4MainSectionId = (typeof CARD4_MAIN_SECTIONS)[number]["id"];

export const CARD4_GST_STEPS = [
  {
    id: "service-categories",
    number: 1,
    title: "Service Categories",
    placeholder: null,
  },
  {
    id: "service-types",
    number: 2,
    title: "Service Types",
    placeholder: null,
  },
  {
    id: "service-pricing",
    number: 3,
    title: "Service Pricing",
    placeholder: "Service Pricing will be implemented in a later phase.",
  },
  {
    id: "department-assignment",
    number: 4,
    title: "Department Assignment",
    placeholder: "Department Assignment will be implemented in a later phase.",
  },
  {
    id: "sla-rules",
    number: 5,
    title: "SLA Rules",
    placeholder: "SLA Rules will be implemented in a later phase.",
  },
  {
    id: "service-availability",
    number: 6,
    title: "Service Availability",
    placeholder: "Service Availability will be implemented in a later phase.",
  },
] as const;

export type Card4GstStepId = (typeof CARD4_GST_STEPS)[number]["id"];

export function card4GstStepById(step: Card4GstStepId) {
  return CARD4_GST_STEPS.find((row) => row.id === step) ?? CARD4_GST_STEPS[0];
}

export function nextCard4GstStep(step: Card4GstStepId): Card4GstStepId | null {
  const index = CARD4_GST_STEPS.findIndex((row) => row.id === step);
  if (index < 0 || index >= CARD4_GST_STEPS.length - 1) return null;
  return CARD4_GST_STEPS[index + 1]?.id ?? null;
}

export function evaluateGstStepStatus(
  step: Card4GstStepId,
  serviceCategoriesConfigured: boolean,
  serviceTypesConfigured = false,
): PropertySetupCardStatus {
  if (step === "service-categories") {
    return serviceCategoriesConfigured ? "complete" : "not_started";
  }
  if (step === "service-types") {
    return serviceTypesConfigured ? "complete" : "not_started";
  }
  return "not_started";
}

export function card4GstCompletedCount(
  stepStatuses: Partial<Record<Card4GstStepId, PropertySetupCardStatus>>,
): number {
  return CARD4_GST_STEPS.filter((row) => stepStatuses[row.id] === "complete").length;
}

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
  requiredFieldsConfigured = false,
  identityDocumentsConfigured = false,
  preferencesConfigured = false,
  companyBusinessConfigured = false,
): PropertySetupCardStatus {
  if (step === "profile-types") {
    if (profileTypesConfigured) return "complete";
    if (stored === "in_progress" || stored === "complete") return stored;
    return "not_started";
  }
  if (step === "required-fields") {
    if (requiredFieldsConfigured) return "complete";
    if (stored === "in_progress" || stored === "complete") return stored;
    return "not_started";
  }
  if (step === "identity-documents") {
    if (identityDocumentsConfigured) return "complete";
    if (stored === "in_progress" || stored === "complete") return stored;
    return "not_started";
  }
  if (step === "preferences") {
    if (preferencesConfigured) return "complete";
    if (stored === "in_progress" || stored === "complete") return stored;
    return "not_started";
  }
  if (step === "company-business") {
    if (companyBusinessConfigured) return "complete";
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
