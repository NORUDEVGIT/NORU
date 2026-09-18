/**
 * Card 6 — Connectivity & Distribution, Phase 1: Integrations.
 *
 * Shared status model and record shapes for the Integrations experience. Pure
 * module: no server imports, so the drawer and the server functions agree on
 * one definition.
 *
 * Phase 1 stores metadata only. NORU has no vault and no per-property secret
 * store, so credentials never reach this layer — see SECRET_STORAGE_NOTICE.
 * The connection test is a simulator and must never produce "connected";
 * that status is reserved for a future phase with real handshakes.
 */

export const INTEGRATION_STATUSES = [
  "connected",
  "pending",
  "not_configured",
  "error",
  "disabled",
] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

export const INTEGRATION_ENVIRONMENTS = ["sandbox", "production"] as const;
export type IntegrationEnvironment = (typeof INTEGRATION_ENVIRONMENTS)[number];

export const INTEGRATION_ACTIVITY_EVENTS = [
  "created",
  "updated",
  "enabled",
  "disabled",
  "deleted",
  "test_passed",
  "test_failed",
] as const;
export type IntegrationActivityEvent = (typeof INTEGRATION_ACTIVITY_EVENTS)[number];

export const INTEGRATION_TEST_RESULTS = ["passed", "failed"] as const;
export type IntegrationTestResult = (typeof INTEGRATION_TEST_RESULTS)[number];

export const SECRET_STORAGE_NOTICE =
  "NORU does not store integration credentials yet. Keys entered here are used for this session only and are never saved.";
export const SECRET_REENTRY_NOTICE =
  "Credentials were not stored when this integration was saved. Re-enter them to run a connection test.";
export const SIMULATED_TEST_NOTICE =
  "Connection tests are simulated in this phase. A passing test records the attempt but does not mark the integration connected.";

/** Field-name shapes that must never be persisted, mirrored by the 0069 check constraint. */
export const SECRET_KEY_PATTERN =
  /(secret|password|passwd|api[_-]?key|token|private|credential|passphrase)/i;

export type IntegrationRecord = {
  id: string;
  name: string;
  category: string;
  provider: string;
  environment: IntegrationEnvironment;
  status: IntegrationStatus;
  enabled: boolean;
  description: string | null;
  authMethod: string | null;
  /** Non-secret field values only. */
  config: Record<string, string | number | boolean>;
  events: string[];
  webhookPath: string | null;
  lastTestAt: string | null;
  lastTestResult: IntegrationTestResult | null;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationActivityRecord = {
  id: string;
  integrationId: string | null;
  integrationName: string;
  event: IntegrationActivityEvent;
  detail: string | null;
  simulated: boolean;
  createdAt: string;
};

export type IntegrationSummary = {
  total: number;
  enabled: number;
  awaitingSetup: number;
  errors: number;
};

export type IntegrationsCard6Snapshot = {
  integrations: IntegrationRecord[];
  activity: IntegrationActivityRecord[];
};

export function integrationStatusLabel(status: IntegrationStatus): string {
  return {
    connected: "Connected",
    pending: "Pending",
    not_configured: "Not Configured",
    error: "Error",
    disabled: "Disabled",
  }[status];
}

export function integrationActivityLabel(event: IntegrationActivityEvent): string {
  return {
    created: "Created",
    updated: "Updated",
    enabled: "Enabled",
    disabled: "Disabled",
    deleted: "Deleted",
    test_passed: "Test passed",
    test_failed: "Test failed",
  }[event];
}

export function summarizeIntegrations(records: readonly IntegrationRecord[]): IntegrationSummary {
  return {
    total: records.length,
    enabled: records.filter((row) => row.enabled).length,
    awaitingSetup: records.filter(
      (row) => row.enabled && (row.status === "pending" || row.status === "not_configured"),
    ).length,
    errors: records.filter((row) => row.status === "error").length,
  };
}

/**
 * Status after saving. A newly configured integration is pending a real
 * handshake; it is never promoted to connected by Phase 1 code.
 */
export function statusAfterSave(enabled: boolean, previous?: IntegrationStatus): IntegrationStatus {
  if (!enabled) return "disabled";
  if (previous === "connected") return "connected";
  return "pending";
}

/**
 * Status after a simulated connection test. A pass records the attempt and
 * leaves the integration pending, because nothing was actually connected.
 */
export function statusAfterSimulatedTest(
  result: IntegrationTestResult,
  enabled: boolean,
): IntegrationStatus {
  if (!enabled) return "disabled";
  return result === "passed" ? "pending" : "error";
}

export function statusAfterToggle(
  enabled: boolean,
  previous: IntegrationStatus,
): IntegrationStatus {
  if (!enabled) return "disabled";
  return previous === "disabled" || previous === "not_configured" ? "pending" : previous;
}

/** Deterministic, non-secret inbound path for providers that call back into NORU. */
export function integrationWebhookPath(restaurantId: string, integrationId: string): string {
  return `/api/integrations/${restaurantId}/${integrationId}`;
}

export function integrationWebhookUrl(origin: string, path: string): string {
  return `${origin.replace(/\/$/, "")}${path}`;
}
