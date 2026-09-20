/**
 * Card 8 Phase 3 — Go-Live governance contract.
 *
 * 0091 stores Go-Live governance only (plan + checklist). Not applied from
 * this turn. Sandbox and cutover lock remain acknowledgements. SET1 #golive
 * / pms_set1_live stay Activate, not this tab.
 */

export type Card8AuditVerdict = "PASS" | "PARTIAL" | "FAIL";
export type Card8GoliveClass =
  "SUPPORTED" | "PARTIAL" | "MISSING" | "REUSABLE" | "OPERATIONAL" | "GOVERNANCE ONLY";

export const CARD8_GOLIVE_SCHEMA_JUSTIFIED = true;
export const CARD8_GOLIVE_SCHEMA_APPLIED = true;
export const CARD8_GOLIVE_MIGRATION = "0091_pms_card8_golive.sql";
export const CARD8_GOLIVE_PROPOSED_MIGRATION = CARD8_GOLIVE_MIGRATION;
export const CARD8_GOLIVE_TABLES = ["pms_golive_plans", "pms_golive_tasks"] as const;

export const CARD8_GOLIVE_PLAN_STATUSES = ["draft", "preparing", "ready"] as const;
export type Card8GolivePlanStatus = (typeof CARD8_GOLIVE_PLAN_STATUSES)[number];

export const CARD8_GOLIVE_PHASE3_REASON =
  "0091 is applied and Go-Live governance is operational. Sandbox runtime, cutover lock enforcement and Property Activation remain out.";

export const CARD8_GOLIVE_NO_SET1_ACTIVATE =
  "Card 8 Go-Live must not call evaluateSet1Checklist, evaluateGoLive or activatePmsSet1. SET1 #golive remains the Activate path.";

export const CARD8_GOLIVE_NO_AUTO_COMPLETE =
  "A Card 1–7 domain being configured must never mark a Go-Live task complete.";

export const CARD8_GOLIVE_SANDBOX_COPY =
  "No property sandbox exists. Capability is unavailable. Do not implement fake production/test separation.";

export const CARD8_GOLIVE_LOCK_COPY =
  "No configuration freeze exists. Cutover lock is unsupported until an approved enforcement phase. Do not expose Lock Configuration.";

export const CARD8_GOLIVE_DATE_COPY =
  "Business date is restaurants.business_date. Night Audit owns the roll. Card 1 business_date_config is policy, not current date.";

export const CARD8_GOLIVE_OPENING_COPY =
  "Opening state must come from the housekeeping dashboard. Occupied is derived from checked-in stays. Do not treat availableRooms as guest-ready.";

export const CARD8_GOLIVE_UPCOMING_COPY =
  "Future reservations are getBookingsDashboard.upcoming. Do not fabricate counts.";

export const CARD8_GOLIVE_VALIDATION_COPY =
  "Go-Live consumes getCard8Validation. Any critical issue means not READY. Do not copy Cards 1–7 evaluators.";

export const CARD8_SANDBOX_POSTURES = ["unavailable", "unavailable_acknowledged"] as const;
export type Card8SandboxPosture = (typeof CARD8_SANDBOX_POSTURES)[number];

export const CARD8_CUTOVER_LOCK_POSTURES = [
  "unsupported_deferred",
  "unsupported_acknowledged",
] as const;
export type Card8CutoverLockPosture = (typeof CARD8_CUTOVER_LOCK_POSTURES)[number];

export const CARD8_GOLIVE_TASK_CATEGORIES = [
  "property",
  "commercial",
  "operations",
  "connectivity",
  "security",
  "data",
] as const;
export type Card8GoliveTaskCategory = (typeof CARD8_GOLIVE_TASK_CATEGORIES)[number];

export const CARD8_GOLIVE_TASK_STATUSES = [
  "not_started",
  "in_progress",
  "complete",
  "not_applicable",
] as const;
export type Card8GoliveTaskStatus = (typeof CARD8_GOLIVE_TASK_STATUSES)[number];

export const CARD8_GOLIVE_TASK_STATUS_LABELS: Record<Card8GoliveTaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
  not_applicable: "Not applicable",
};

export const CARD8_GOLIVE_TASK_CATALOGUE = [
  {
    code: "confirm-identity-legal",
    category: "property",
    title: "Confirm identity and legal setup",
  },
  {
    code: "confirm-rates-published",
    category: "commercial",
    title: "Confirm rates and guest rules are publishable",
  },
  {
    code: "confirm-opening-board",
    category: "operations",
    title: "Confirm housekeeping opening board",
  },
  {
    code: "confirm-integrations-honesty",
    category: "connectivity",
    title: "Confirm integrations are not claimed Connected",
  },
  {
    code: "confirm-security-setup",
    category: "security",
    title: "Confirm security and audit governance",
  },
  {
    code: "confirm-data-governance",
    category: "data",
    title: "Confirm reports and import remain setup-only",
  },
] as const;

export type Card8GoliveCapability = {
  id: string;
  label: string;
  classification: Card8GoliveClass;
  source: string;
  note: string;
};

export const CARD8_GOLIVE_CAPABILITIES: Card8GoliveCapability[] = [
  {
    id: "set1-activate",
    label: "SET1 #golive Activate",
    classification: "OPERATIONAL",
    source: "activatePmsSet1 / pms_set1_live",
    note: "Owner-only Activate. Out of Phase 3. Different hash from #system-go-live.",
  },
  {
    id: "set1-checklist",
    label: "SET1 in-memory checklist",
    classification: "REUSABLE",
    source: "evaluateSet1Checklist / evaluateGoLive",
    note: "Activate gate only. Not the Card 8 Property–Data task list.",
  },
  {
    id: "validation",
    label: "System Validation gate",
    classification: "REUSABLE",
    source: "getCard8Validation",
    note: "Any critical issue blocks Go-Live READY.",
  },
  {
    id: "business-date",
    label: "Business date",
    classification: "REUSABLE",
    source: "restaurants.business_date / getPropertyBusinessDate",
    note: "Authoritative current date. Do not invent a second clock.",
  },
  {
    id: "opening-state",
    label: "Opening state",
    classification: "REUSABLE",
    source: "getHousekeepingDashboard",
    note: "total, occupied, vacant, dirty/clean/inspected, OOO/OOS.",
  },
  {
    id: "future-reservations",
    label: "Future reservations",
    classification: "REUSABLE",
    source: "getBookingsDashboard.upcoming",
    note: "pending/confirmed with arrival after today.",
  },
  {
    id: "checklist",
    label: "Go-Live checklist",
    classification: "OPERATIONAL",
    source: "pms_golive_tasks",
    note: "Ownership via restaurant membership id. Status is explicit, never inferred.",
  },
  {
    id: "sandbox",
    label: "Test / sandbox",
    classification: "GOVERNANCE ONLY",
    source: "none — Card 6 environment is connector metadata",
    note: CARD8_GOLIVE_SANDBOX_COPY,
  },
  {
    id: "cutover-lock",
    label: "Cutover lock",
    classification: "GOVERNANCE ONLY",
    source: "none — lockDuringAudit is unenforced Card 1 config",
    note: CARD8_GOLIVE_LOCK_COPY,
  },
];

export type Card8GoliveReadinessInput = {
  validationCritical: number;
  businessDateConfirmed: boolean;
  openingStateConfirmed: boolean;
  futureReservationsConfirmed: boolean;
  sandboxPosture: Card8SandboxPosture;
  cutoverLockPosture: Card8CutoverLockPosture;
  incompleteRequiredTasks: number;
};

export type Card8GolivePlan = {
  id: string | null;
  status: Card8GolivePlanStatus;
  businessDateConfirmed: boolean;
  openingStateConfirmed: boolean;
  futureReservationsConfirmed: boolean;
  sandboxAcknowledgement: boolean;
  cutoverLockAcknowledgement: boolean;
  notes: string;
  updatedAt: string | null;
};

export type Card8GoliveTask = {
  id: string | null;
  category: Card8GoliveTaskCategory;
  taskKey: string;
  title: string;
  required: boolean;
  ownerDepartmentId: string | null;
  ownerUserId: string | null;
  status: Card8GoliveTaskStatus;
  notes: string;
  sortOrder: number;
};

export type Card8GoliveOwnerOption = {
  id: string;
  label: string;
};

export type Card8GoliveOpeningSnapshot = {
  totalRooms: number;
  occupied: number;
  vacant: number;
  available: number;
  dirty: number;
  outOfOrder: number;
  outOfService: number;
};

export type Card8GoliveSnapshot = {
  plan: Card8GolivePlan;
  tasks: Card8GoliveTask[];
  departments: Card8GoliveOwnerOption[];
  users: Card8GoliveOwnerOption[];
  businessDate: string | null;
  opening: Card8GoliveOpeningSnapshot;
  futureReservations: number;
  canEdit: boolean;
};

export function emptyCard8GolivePlan(): Card8GolivePlan {
  return {
    id: null,
    status: "draft",
    businessDateConfirmed: false,
    openingStateConfirmed: false,
    futureReservationsConfirmed: false,
    sandboxAcknowledgement: false,
    cutoverLockAcknowledgement: false,
    notes: "",
    updatedAt: null,
  };
}

export function emptyCard8GoliveTasks(): Card8GoliveTask[] {
  return CARD8_GOLIVE_TASK_CATALOGUE.map((task, index) => ({
    id: null,
    category: task.category,
    taskKey: task.code,
    title: task.title,
    required: true,
    ownerDepartmentId: null,
    ownerUserId: null,
    status: "not_started",
    notes: "",
    sortOrder: index,
  }));
}

export function incompleteRequiredGoliveTasks(tasks: readonly Card8GoliveTask[]): number {
  return tasks.filter(
    (task) => task.required && task.status !== "complete" && task.status !== "not_applicable",
  ).length;
}

export function card8GoliveReadinessInput(
  plan: Card8GolivePlan,
  tasks: readonly Card8GoliveTask[],
  validationCritical: number,
): Card8GoliveReadinessInput {
  return {
    validationCritical,
    businessDateConfirmed: plan.businessDateConfirmed,
    openingStateConfirmed: plan.openingStateConfirmed,
    futureReservationsConfirmed: plan.futureReservationsConfirmed,
    sandboxPosture: plan.sandboxAcknowledgement ? "unavailable_acknowledged" : "unavailable",
    cutoverLockPosture: plan.cutoverLockAcknowledgement
      ? "unsupported_acknowledged"
      : "unsupported_deferred",
    incompleteRequiredTasks: incompleteRequiredGoliveTasks(tasks),
  };
}

export function card8GoliveReady(input: Card8GoliveReadinessInput): boolean {
  return (
    input.validationCritical === 0 &&
    input.businessDateConfirmed &&
    input.openingStateConfirmed &&
    input.futureReservationsConfirmed &&
    input.sandboxPosture === "unavailable_acknowledged" &&
    input.cutoverLockPosture === "unsupported_acknowledged" &&
    input.incompleteRequiredTasks === 0
  );
}

export type Card8GolivePhase3Report = {
  verdict: Card8AuditVerdict;
  reason: string;
  schemaJustified: true;
  schemaApplied: true;
  ready: false;
  sandbox: "unavailable";
  cutoverLock: "unsupported_deferred";
  capabilities: Card8GoliveCapability[];
  catalogue: typeof CARD8_GOLIVE_TASK_CATALOGUE;
};

export function evaluateCard8GolivePhase3(): Card8GolivePhase3Report {
  return {
    verdict: "PASS",
    reason: CARD8_GOLIVE_PHASE3_REASON,
    schemaJustified: CARD8_GOLIVE_SCHEMA_JUSTIFIED,
    schemaApplied: CARD8_GOLIVE_SCHEMA_APPLIED,
    ready: false,
    sandbox: "unavailable",
    cutoverLock: "unsupported_deferred",
    capabilities: CARD8_GOLIVE_CAPABILITIES,
    catalogue: CARD8_GOLIVE_TASK_CATALOGUE,
  };
}
