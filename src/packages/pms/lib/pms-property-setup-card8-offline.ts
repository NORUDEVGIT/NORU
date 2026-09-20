/**
 * Card 8 Phase 1 — Offline & Sync policy contract.
 *
 * 0090 stores setup policy only. There is no offline runtime. SET6 JSONB
 * remains legacy intent and never completes Card 8.
 */

import type {
  OfflineEnablementPosture,
  OfflineSyncPosture,
} from "./pms-set6-sales-distribution.ts";

export const CARD8_OFFLINE_SCHEMA_APPLIED = true;
export const CARD8_OFFLINE_MIGRATION = "0090_pms_card8_offline_policy.sql";
export const CARD8_OFFLINE_TABLES = ["pms_offline_policies", "pms_offline_capabilities"] as const;
export const CARD8_OFFLINE_UNAVAILABLE =
  "Unavailable — Card 8 offline policy tables are not applied yet.";
export const CARD8_OFFLINE_AUDIT = "pms_card8_offline_policy_updated";
export const CARD8_OFFLINE_AUDIT_SECTION = "offline-sync";

export const CARD8_OFFLINE_POLICY_ONLY_COPY =
  "Configuration here defines policy only. NORU does not currently provide the offline runtime engine.";

export const CARD8_OFFLINE_RUNTIME_ABSENT =
  "NORU has no approved offline runtime. Policy-configured never means runtime-supported.";

export const CARD8_OFFLINE_SET6_LEGACY =
  "SET6 Front Office / PMS toggles and conflict labels are legacy intent only. They do not complete Card 8 Offline & Sync.";

export const CARD8_OFFLINE_NEVER_GATEWAY =
  "Never represent external gateway transactions as successful offline.";

export const CARD8_OFFLINE_NEVER_READY_COPY =
  "Saving offline policy must never read Offline Ready. Runtime status remains unavailable.";

export const CARD8_OFFLINE_RUNTIME_WARNING =
  "Runtime limitation: no offline engine, local queue, device registry or sync-health metrics exist.";

export type Card8AuditVerdict = "PASS" | "PARTIAL" | "FAIL";

export const CARD8_SYNC_MODES = ["automatic", "manual"] as const;
export type Card8SyncMode = (typeof CARD8_SYNC_MODES)[number];

export const CARD8_CONFLICT_POLICIES = [
  "server_authoritative",
  "version_check",
  "business_rule",
  "manual_review",
] as const;
export type Card8ConflictPolicy = (typeof CARD8_CONFLICT_POLICIES)[number];

export const CARD8_FAILED_EVENT_POLICIES = [
  "hold",
  "retry_then_hold",
  "discard_non_financial",
] as const;
export type Card8FailedEventPolicy = (typeof CARD8_FAILED_EVENT_POLICIES)[number];

export const CARD8_FINANCIAL_OFFLINE = ["forbidden", "cash_pending_only"] as const;
export type Card8FinancialOffline = (typeof CARD8_FINANCIAL_OFFLINE)[number];

export const CARD8_POLICY_STATES = ["unavailable", "policy_configured"] as const;
export type Card8PolicyState = (typeof CARD8_POLICY_STATES)[number];

export const CARD8_SYNC_PRIORITIES = [1, 2, 3] as const;
export type Card8SyncPriority = (typeof CARD8_SYNC_PRIORITIES)[number];

export const CARD8_OFFLINE_CAPABILITY_CODES = [
  "front_office",
  "reservations",
  "room_status",
  "housekeeping",
  "guest_profile",
  "cashiering_controlled",
  "basic_payments_controlled",
] as const;
export type Card8OfflineCapabilityCode = (typeof CARD8_OFFLINE_CAPABILITY_CODES)[number];

export const CARD8_OFFLINE_CAPABILITY_LABELS: Record<Card8OfflineCapabilityCode, string> = {
  front_office: "Front Office",
  reservations: "Reservations",
  room_status: "Room Status",
  housekeeping: "Housekeeping",
  guest_profile: "Guest Profile",
  cashiering_controlled: "Cashiering (controlled)",
  basic_payments_controlled: "Basic payments (controlled)",
};

export const CARD8_OFFLINE_FORBIDDEN_CAPABILITIES = [
  "gateway_payments",
  "ota_sync",
  "night_audit",
  "device_registry",
  "encryption",
] as const;

export const CARD8_FINANCIAL_CAPABILITY_CODES = [
  "cashiering_controlled",
  "basic_payments_controlled",
] as const;

export const CARD8_SYNC_MODE_LABELS: Record<Card8SyncMode, string> = {
  automatic: "Automatic",
  manual: "Manual",
};

export const CARD8_CONFLICT_POLICY_LABELS: Record<Card8ConflictPolicy, string> = {
  server_authoritative: "Server authoritative",
  version_check: "Version / timestamp check",
  business_rule: "Business-rule resolution",
  manual_review: "Manual review",
};

export const CARD8_FAILED_EVENT_LABELS: Record<Card8FailedEventPolicy, string> = {
  hold: "Hold",
  retry_then_hold: "Retry, then hold",
  discard_non_financial: "Discard non-financial",
};

export const CARD8_FINANCIAL_OFFLINE_LABELS: Record<Card8FinancialOffline, string> = {
  forbidden: "Forbidden",
  cash_pending_only: "Cash pending only",
};

export const CARD8_POLICY_STATE_LABELS: Record<Card8PolicyState, string> = {
  unavailable: "Unavailable",
  policy_configured: "Policy configured",
};

export type Card8OfflinePolicyRow = {
  id: string | null;
  offlineModeEnabled: boolean;
  configured: boolean;
  cachePreviousDays: number;
  cacheFutureDays: number;
  syncMode: Card8SyncMode;
  syncIntervalMinutes: number;
  retryIntervalMinutes: number;
  maximumRetryAttempts: number;
  conflictPolicy: Card8ConflictPolicy;
  failedEventPolicy: Card8FailedEventPolicy;
  financialOfflinePolicy: Card8FinancialOffline;
  updatedAt: string | null;
};

export type Card8OfflineCapabilityRow = {
  id: string | null;
  capabilityKey: Card8OfflineCapabilityCode;
  policyState: Card8PolicyState;
  syncPriority: Card8SyncPriority;
  controlledFinancial: boolean;
  active: boolean;
};

export type Card8OfflineSnapshot = {
  available: boolean;
  policy: Card8OfflinePolicyRow;
  capabilities: Card8OfflineCapabilityRow[];
};

export type Card8OfflineReadiness = {
  status: PropertySetupCardStatus;
  ready: boolean;
  verdict: Card8AuditVerdict;
  blockers: string[];
  warnings: string[];
};

export function isCard8SyncMode(value: unknown): value is Card8SyncMode {
  return (CARD8_SYNC_MODES as readonly string[]).includes(String(value));
}

export function isCard8ConflictPolicy(value: unknown): value is Card8ConflictPolicy {
  return (CARD8_CONFLICT_POLICIES as readonly string[]).includes(String(value));
}

export function isCard8FailedEventPolicy(value: unknown): value is Card8FailedEventPolicy {
  return (CARD8_FAILED_EVENT_POLICIES as readonly string[]).includes(String(value));
}

export function isCard8FinancialOffline(value: unknown): value is Card8FinancialOffline {
  return (CARD8_FINANCIAL_OFFLINE as readonly string[]).includes(String(value));
}

export function isCard8PolicyState(value: unknown): value is Card8PolicyState {
  return (CARD8_POLICY_STATES as readonly string[]).includes(String(value));
}

export function isCard8CapabilityCode(value: unknown): value is Card8OfflineCapabilityCode {
  return (CARD8_OFFLINE_CAPABILITY_CODES as readonly string[]).includes(String(value));
}

export function isCard8SyncPriority(value: unknown): value is Card8SyncPriority {
  return (CARD8_SYNC_PRIORITIES as readonly number[]).includes(Number(value));
}

export function controlledFinancialFor(key: Card8OfflineCapabilityCode): boolean {
  return (CARD8_FINANCIAL_CAPABILITY_CODES as readonly string[]).includes(key);
}

export function emptyCard8OfflinePolicy(): Card8OfflinePolicyRow {
  return {
    id: null,
    offlineModeEnabled: false,
    configured: false,
    cachePreviousDays: 0,
    cacheFutureDays: 0,
    syncMode: "manual",
    syncIntervalMinutes: 15,
    retryIntervalMinutes: 5,
    maximumRetryAttempts: 0,
    conflictPolicy: "server_authoritative",
    failedEventPolicy: "hold",
    financialOfflinePolicy: "forbidden",
    updatedAt: null,
  };
}

export function emptyCard8OfflineCapability(
  code: Card8OfflineCapabilityCode,
): Card8OfflineCapabilityRow {
  return {
    id: null,
    capabilityKey: code,
    policyState: "unavailable",
    syncPriority: 3,
    controlledFinancial: controlledFinancialFor(code),
    active: true,
  };
}

export function emptyCard8OfflineSnapshot(
  partial?: Partial<Card8OfflineSnapshot>,
): Card8OfflineSnapshot {
  return {
    available: true,
    policy: emptyCard8OfflinePolicy(),
    capabilities: CARD8_OFFLINE_CAPABILITY_CODES.map((code) => emptyCard8OfflineCapability(code)),
    ...partial,
  };
}

export function set6DoesNotCompleteCard8(
  enablement?: Pick<OfflineEnablementPosture, "frontOfficeEnabled" | "pmsEnabled" | "savedAt">,
  sync?: Pick<OfflineSyncPosture, "conflictLabel" | "savedAt">,
): false {
  void enablement;
  void sync;
  return false;
}

export function card8OfflinePolicyErrors(policy: Card8OfflinePolicyRow): string[] {
  const errors: string[] = [];
  if (policy.cachePreviousDays < 0 || policy.cachePreviousDays > 365) {
    errors.push("Previous cache days must be between 0 and 365.");
  }
  if (policy.cacheFutureDays < 0 || policy.cacheFutureDays > 365) {
    errors.push("Future cache days must be between 0 and 365.");
  }
  if (!isCard8SyncMode(policy.syncMode)) errors.push("Select automatic or manual sync mode.");
  if (policy.syncIntervalMinutes < 1 || policy.syncIntervalMinutes > 10080) {
    errors.push("Sync interval must be between 1 and 10080 minutes.");
  }
  if (policy.retryIntervalMinutes < 1 || policy.retryIntervalMinutes > 1440) {
    errors.push("Retry interval must be between 1 and 1440 minutes.");
  }
  if (policy.maximumRetryAttempts < 0 || policy.maximumRetryAttempts > 20) {
    errors.push("Maximum retry attempts must be between 0 and 20.");
  }
  if (!isCard8ConflictPolicy(policy.conflictPolicy)) errors.push("Select a conflict policy.");
  if (!isCard8FailedEventPolicy(policy.failedEventPolicy))
    errors.push("Select a failed-event policy.");
  if (!isCard8FinancialOffline(policy.financialOfflinePolicy)) {
    errors.push(CARD8_OFFLINE_NEVER_GATEWAY);
  }
  if ((policy.financialOfflinePolicy as string) === "gateway_success") {
    errors.push(CARD8_OFFLINE_NEVER_GATEWAY);
  }
  return errors;
}

export function card8OfflineCapabilityErrors(rows: Card8OfflineCapabilityRow[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!isCard8CapabilityCode(row.capabilityKey)) {
      errors.push(`Unsupported capability ${row.capabilityKey}.`);
      continue;
    }
    if (seen.has(row.capabilityKey)) errors.push(`Duplicate capability ${row.capabilityKey}.`);
    seen.add(row.capabilityKey);
    if (row.policyState === ("runtime_supported" as Card8PolicyState)) {
      errors.push(`${row.capabilityKey} cannot be runtime-supported; no engine is approved.`);
    }
    if (!isCard8PolicyState(row.policyState)) {
      errors.push(`${row.capabilityKey} must be unavailable or policy configured.`);
    }
    if (!isCard8SyncPriority(row.syncPriority)) {
      errors.push(`${row.capabilityKey} sync priority must be 1, 2 or 3.`);
    }
    if (row.controlledFinancial !== controlledFinancialFor(row.capabilityKey)) {
      errors.push(`${row.capabilityKey} financial flag is fixed by capability type.`);
    }
  }
  for (const code of CARD8_OFFLINE_CAPABILITY_CODES) {
    if (!seen.has(code)) errors.push(`Missing capability ${code}.`);
  }
  return errors;
}

export function evaluateCard8OfflineReadiness(
  snapshot: Card8OfflineSnapshot,
): Card8OfflineReadiness {
  const blockers: string[] = [];
  const warnings = [CARD8_OFFLINE_RUNTIME_WARNING];
  if (!snapshot.available) {
    blockers.push(CARD8_OFFLINE_UNAVAILABLE);
  } else {
    blockers.push(...card8OfflinePolicyErrors(snapshot.policy));
    blockers.push(...card8OfflineCapabilityErrors(snapshot.capabilities));
    if (!snapshot.policy.configured) {
      blockers.push("Save Offline & Sync policy before this domain is ready.");
    }
  }
  warnings.push(CARD8_OFFLINE_POLICY_ONLY_COPY);
  const ready = blockers.length === 0;
  let verdict: Card8AuditVerdict = "FAIL";
  if (ready) verdict = "PASS";
  else if (snapshot.available && snapshot.policy.configured) verdict = "PARTIAL";
  return {
    status: ready ? "in_progress" : snapshot.policy.configured ? "in_progress" : "not_started",
    ready,
    verdict,
    blockers,
    warnings,
  };
}
