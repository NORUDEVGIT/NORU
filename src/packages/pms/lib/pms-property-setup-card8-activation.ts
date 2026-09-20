/** Card 8 Phase 4 — canonical Property Activation contract. */

export type Card8AuditVerdict = "PASS" | "PARTIAL" | "FAIL";
export type Card8ActivationClass = "SUPPORTED" | "REUSABLE" | "CANONICAL" | "GOVERNANCE ONLY";

export const CARD8_ACTIVATION_LIFECYCLE_JUSTIFIED = false;
export const CARD8_ACTIVATION_SCHEMA_APPLIED = false;
export const CARD8_ACTIVATION_CANONICAL_FLAG = "pms_set1_live";
export const CARD8_ACTIVATION_CANONICAL_WRITER = "activatePmsSet1";

export const CARD8_ACTIVATION_PHASE4_REASON =
  "Canonical owner-only activatePmsSet1 now enforces Card 8 Validation, Go-Live readiness, business date, explicit confirmation and the existing SET1 checklist for every entry point.";

export const CARD8_ACTIVATION_WRAP_ONLY =
  "Card 8 invokes activatePmsSet1. No second activation mutation or live-state writer exists.";

export const CARD8_ACTIVATION_SET1_BYPASS =
  "SET1 #golive uses the same hardened activatePmsSet1 path and cannot bypass Card 8 gates.";

export const CARD8_ACTIVATION_OWNER_ONLY =
  "Activation authz stays SET1_ACTIVATE_ROLES owner-only. Do not weaken to manager. Do not wire Card 7 configuration.property.activate.";

export const CARD8_ACTIVATION_NO_LIFECYCLE_SQL =
  "Lifecycle persistence remains deferred. No 0092, lifecycle column or lifecycle history is part of Phase 4.";

export const CARD8_ACTIVATION_EXPLICIT_CONFIRM =
  "Every activation request must include explicit confirmation and the server validates it.";

export type Card8ActivationCapability = {
  id: string;
  label: string;
  classification: Card8ActivationClass;
  source: string;
  note: string;
};

export const CARD8_ACTIVATION_CAPABILITIES: Card8ActivationCapability[] = [
  {
    id: "canonical-writer",
    label: "activatePmsSet1",
    classification: "CANONICAL",
    source: "pms-set1-foundation.functions.ts",
    note: "Owner-only. Writes restaurants.pms_set1_live = true. SET1 mandatory checklist still applies.",
  },
  {
    id: "canonical-flag",
    label: "pms_set1_live",
    classification: "CANONICAL",
    source: "restaurants.pms_set1_live",
    note: "Single operational live flag. Card 1 save strips this field. Do not add a second boolean.",
  },
  {
    id: "set1-golive-ui",
    label: "SET1 #golive UI",
    classification: "SUPPORTED",
    source: "Set1GoLiveSection",
    note: CARD8_ACTIVATION_SET1_BYPASS,
  },
  {
    id: "set1-checklist",
    label: "SET1 in-memory checklist",
    classification: "CANONICAL",
    source: "evaluateSet1Checklist / evaluateGoLive",
    note: "Activate gate for foundation + SET2–4 mandatory missing. Not Card 8 Validation or Go-Live tasks.",
  },
  {
    id: "authz",
    label: "Activation authz",
    classification: "CANONICAL",
    source: "canActivateSet1 / SET1_ACTIVATE_ROLES",
    note: CARD8_ACTIVATION_OWNER_ONLY,
  },
  {
    id: "audit",
    label: "Activation audit",
    classification: "REUSABLE",
    source: "restaurant_staff_audit_log pms_set1_updated",
    note: "Reuse the existing staff audit path. No second event store.",
  },
  {
    id: "card7-activate",
    label: "Card 7 configuration.property.activate",
    classification: "GOVERNANCE ONLY",
    source: "pms_permission_catalogue",
    note: "Setup catalogue only. Live authz stays in domain modules. Do not enforce activation through Card 7.",
  },
  {
    id: "validation",
    label: "System Validation gate",
    classification: "REUSABLE",
    source: "getCard8Validation",
    note: "Any critical issue blocks activation. Warnings remain visible.",
  },
  {
    id: "golive",
    label: "Go-Live readiness gate",
    classification: "REUSABLE",
    source: "card8GoliveReady",
    note: "Confirmations, sandbox acknowledgement, lock acknowledgement, no incomplete required tasks.",
  },
  {
    id: "explicit-confirm",
    label: "Explicit activation confirmation",
    classification: "SUPPORTED",
    source: "activatePmsSet1 input",
    note: CARD8_ACTIVATION_EXPLICIT_CONFIRM,
  },
  {
    id: "card8-tab",
    label: "Card 8 Property Activation tab",
    classification: "SUPPORTED",
    source: "Card8ActivationTab",
    note: "Read-only preflight plus explicit confirmation invokes canonical activatePmsSet1.",
  },
  {
    id: "lifecycle",
    label: "Property lifecycle persistence",
    classification: "GOVERNANCE ONLY",
    source: "none",
    note: CARD8_ACTIVATION_NO_LIFECYCLE_SQL,
  },
];

export type Card8ActivationGateInput = {
  validationCritical: number;
  goliveReady: boolean;
  businessDateConfirmed: boolean;
  explicitConfirmation: boolean;
  canActivateSet1: boolean;
};

export function card8ActivationGatesPass(input: Card8ActivationGateInput): boolean {
  return (
    input.validationCritical === 0 &&
    input.goliveReady &&
    input.businessDateConfirmed &&
    input.explicitConfirmation &&
    input.canActivateSet1
  );
}

export type Card8ActivationPhase4Report = {
  verdict: Card8AuditVerdict;
  reason: string;
  lifecycleJustified: false;
  schemaApplied: false;
  canonicalActivationRetained: true;
  hardGatesImplemented: true;
  set1BypassClosed: true;
  canonicalFlag: typeof CARD8_ACTIVATION_CANONICAL_FLAG;
  canonicalWriter: typeof CARD8_ACTIVATION_CANONICAL_WRITER;
  capabilities: Card8ActivationCapability[];
};

export function evaluateCard8ActivationPhase4(): Card8ActivationPhase4Report {
  return {
    verdict: "PASS",
    reason: CARD8_ACTIVATION_PHASE4_REASON,
    lifecycleJustified: CARD8_ACTIVATION_LIFECYCLE_JUSTIFIED,
    schemaApplied: CARD8_ACTIVATION_SCHEMA_APPLIED,
    canonicalActivationRetained: true,
    hardGatesImplemented: true,
    set1BypassClosed: true,
    canonicalFlag: CARD8_ACTIVATION_CANONICAL_FLAG,
    canonicalWriter: CARD8_ACTIVATION_CANONICAL_WRITER,
    capabilities: CARD8_ACTIVATION_CAPABILITIES,
  };
}
