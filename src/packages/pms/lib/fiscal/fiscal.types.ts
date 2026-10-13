/**
 * Fiscal integration foundation (P1).
 *
 * P1 provides configuration, server-only credentials, token caching, mappings,
 * registration storage, and an outbox. It does not send invoices, credit notes,
 * debit notes, sales receipts, withholding, or cancellations.
 *
 * P2 invoice registration. P3 credit and debit notes. P4 sales receipts.
 * P5 withholding. P6 cancellation.
 *
 * NORU stays the financial source of truth. This module must not post ledger
 * rows or change settlement, cashier shift, or statement math.
 */

export const FISCAL_PROVIDER = "erp_fiscal";
export const FISCAL_CATEGORY = "fiscal";
export const FISCAL_INTEGRATION_NAME = "ERP / Fiscal Integration";

export const FISCAL_ENVIRONMENTS = ["TEST", "PRODUCTION"] as const;
export type FiscalEnvironment = (typeof FISCAL_ENVIRONMENTS)[number];

export const FISCAL_DOCUMENT_TYPES = ["INV", "CRE", "DEB", "SALES_RECEIPT", "WITHHOLDING"] as const;
export type FiscalDocumentType = (typeof FISCAL_DOCUMENT_TYPES)[number];

export const FISCAL_SOURCE_TYPES = [
  "guest_invoice",
  "account_invoice",
  "credit_note",
  "debit_note",
  "guest_allocation",
  "account_allocation",
  "withholding",
] as const;
export type FiscalSourceType = (typeof FISCAL_SOURCE_TYPES)[number];

export const FISCAL_REGISTRATION_STATUSES = [
  "NOT_REGISTERED",
  "BLOCKED",
  "PENDING",
  "REGISTERED",
  "FAILED",
  "CANCEL_PENDING",
  "CANCELLED",
] as const;
export type FiscalRegistrationStatus = (typeof FISCAL_REGISTRATION_STATUSES)[number];

export const FISCAL_MODE_CONTEXTS = [
  "guest_invoice",
  "company_invoice",
  "group_invoice",
  "credit_note",
  "debit_note",
] as const;
export type FiscalModeContext = (typeof FISCAL_MODE_CONTEXTS)[number];

export const FISCAL_MODE_CONTEXT_LABELS: Record<FiscalModeContext, string> = {
  guest_invoice: "Guest invoice",
  company_invoice: "Company invoice",
  group_invoice: "Group invoice",
  credit_note: "Credit note",
  debit_note: "Debit note",
};

export const FISCAL_BUYER_MAPPING_TYPES = ["ID_TYPE", "CITY", "REGION", "ZONE", "WEREDA"] as const;
export type FiscalBuyerMappingType = (typeof FISCAL_BUYER_MAPPING_TYPES)[number];

export const FISCAL_CHARGE_SOURCES = [
  "room",
  "manual",
  "service",
  "pos",
  "package",
  "transfer",
  "system",
] as const;
export type FiscalChargeSource = (typeof FISCAL_CHARGE_SOURCES)[number];

export const FISCAL_ERROR_CODES = [
  "FISCAL_CONFIG_MISSING",
  "FISCAL_CREDENTIALS_MISSING",
  "FISCAL_AUTH_FAILED",
  "FISCAL_AUTH_RESPONSE_INVALID",
  "FISCAL_TIMEOUT",
  "FISCAL_NETWORK_ERROR",
  "FISCAL_MAPPING_INVALID",
  "FISCAL_SECRET_STORE_UNAVAILABLE",
  "FISCAL_HANDLER_NOT_ENABLED",
  "FISCAL_FORBIDDEN",
] as const;
export type FiscalErrorCode = (typeof FISCAL_ERROR_CODES)[number];

export class FiscalError extends Error {
  readonly code: FiscalErrorCode;
  constructor(code: FiscalErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "FiscalError";
  }
}

export const FISCAL_SAFE_MESSAGES: Record<FiscalErrorCode, string> = {
  FISCAL_CONFIG_MISSING: "The fiscal connection is incomplete.",
  FISCAL_CREDENTIALS_MISSING: "Fiscal API credentials have not been configured.",
  FISCAL_AUTH_FAILED: "Authentication was rejected by the fiscal service.",
  FISCAL_AUTH_RESPONSE_INVALID:
    "The fiscal service returned an unexpected authentication response.",
  FISCAL_TIMEOUT: "The fiscal service did not respond in time.",
  FISCAL_NETWORK_ERROR: "NORU could not reach the fiscal service.",
  FISCAL_MAPPING_INVALID: "That fiscal mapping is not valid.",
  FISCAL_SECRET_STORE_UNAVAILABLE: "The server secret store is unavailable.",
  FISCAL_HANDLER_NOT_ENABLED: "Fiscal document registration is not enabled yet.",
  FISCAL_FORBIDDEN: "You don't have permission to change fiscal integration settings.",
};

export type FiscalAuthRequest = {
  tin_no: string;
  client: string;
};

export type FiscalAuthResponse = {
  status: number;
  message: string;
  data: {
    access_token: string;
    expires_in: number;
  };
};

export type FiscalConnectionInput = {
  environment: FiscalEnvironment;
  baseUrl: string;
  taxpayerTin: string;
  client: string;
  deviceId: string;
  enabled: boolean;
};

export type FiscalConnectionConfig = FiscalConnectionInput;

const HTTPS_URL = /^https:\/\/[^\s]+$/i;
const HTTP_LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i;

export function normalizeBaseUrl(value: string, environment: FiscalEnvironment): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed.length === 0)
    throw new FiscalError("FISCAL_CONFIG_MISSING", "Enter the fiscal base URL.");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new FiscalError("FISCAL_CONFIG_MISSING", "Enter a valid fiscal base URL.");
  }
  if (parsed.username || parsed.password) {
    throw new FiscalError(
      "FISCAL_CONFIG_MISSING",
      "Put credentials in the credentials section, not the URL.",
    );
  }
  const href = parsed.toString().replace(/\/$/, "");
  if (environment === "PRODUCTION") {
    if (!HTTPS_URL.test(href)) {
      throw new FiscalError("FISCAL_CONFIG_MISSING", "Production requires an https:// base URL.");
    }
  } else if (!HTTPS_URL.test(href) && !HTTP_LOCAL.test(href)) {
    throw new FiscalError("FISCAL_CONFIG_MISSING", "Test requires an https:// base URL.");
  }
  return href;
}

export function normalizeFiscalConnection(input: FiscalConnectionInput): FiscalConnectionConfig {
  const environment = input.environment;
  if (!FISCAL_ENVIRONMENTS.includes(environment)) {
    throw new FiscalError("FISCAL_CONFIG_MISSING", "Choose TEST or PRODUCTION.");
  }
  const taxpayerTin = input.taxpayerTin.trim();
  const client = input.client.trim();
  const deviceId = input.deviceId.trim();
  if (taxpayerTin.length === 0)
    throw new FiscalError("FISCAL_CONFIG_MISSING", "Enter the taxpayer TIN.");
  if (client.length === 0)
    throw new FiscalError("FISCAL_CONFIG_MISSING", "Enter the fiscal client identifier.");
  if (deviceId.length === 0) throw new FiscalError("FISCAL_CONFIG_MISSING", "Enter the device ID.");
  if (taxpayerTin.length > 40 || client.length > 40 || deviceId.length > 40) {
    throw new FiscalError(
      "FISCAL_CONFIG_MISSING",
      "TIN, client, and device ID must be 40 characters or fewer.",
    );
  }
  return {
    environment,
    baseUrl: normalizeBaseUrl(input.baseUrl, environment),
    taxpayerTin,
    client,
    deviceId,
    enabled: input.enabled === true,
  };
}

export function fiscalRowEnvironment(environment: FiscalEnvironment): "sandbox" | "production" {
  return environment === "PRODUCTION" ? "production" : "sandbox";
}

export function maskTin(tin: string): string {
  const value = tin.trim();
  if (value.length <= 4) return "****";
  return `${value.slice(0, 4)}******`;
}

export function maskDeviceId(deviceId: string): string {
  const value = deviceId.trim();
  if (value.length <= 4) return "****";
  return `${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

const SECRET_KEY =
  /(secret|password|passwd|api[_-]?key|token|private|credential|passphrase|authorization)/i;

export function redactFiscalPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactFiscalPayload(item));
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = redactFiscalPayload(item);
  }
  return output;
}

export const FISCAL_TOKEN_SAFETY_MS = 5 * 60 * 1000;
export const FISCAL_REQUEST_TIMEOUT_MS = 15_000;
export const FISCAL_MAX_ATTEMPTS = 5;
export const FISCAL_RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  240 * 60_000,
] as const;

export type FiscalAttemptOutcome = "success" | "retryable_error" | "fatal_error" | "timeout";

export function classifyFiscalFailure(input: {
  code?: FiscalErrorCode;
  httpStatus?: number | null;
}): { outcome: FiscalAttemptOutcome; retryable: boolean } {
  if (input.code === "FISCAL_TIMEOUT") return { outcome: "timeout", retryable: true };
  if (input.code === "FISCAL_NETWORK_ERROR") return { outcome: "retryable_error", retryable: true };
  if (
    input.code === "FISCAL_AUTH_FAILED" &&
    (input.httpStatus === 401 || input.httpStatus == null)
  ) {
    return { outcome: "retryable_error", retryable: true };
  }
  const status = input.httpStatus ?? 0;
  if (status === 429 || status >= 500) return { outcome: "retryable_error", retryable: true };
  return { outcome: "fatal_error", retryable: false };
}

export function nextFiscalRetryAt(attemptCount: number, now = new Date()): Date | null {
  const index = attemptCount - 1;
  if (index < 0 || index >= FISCAL_RETRY_DELAYS_MS.length) return null;
  return new Date(now.getTime() + FISCAL_RETRY_DELAYS_MS[index]);
}

const TRANSITIONS: Record<FiscalRegistrationStatus, readonly FiscalRegistrationStatus[]> = {
  NOT_REGISTERED: ["BLOCKED", "PENDING"],
  BLOCKED: ["PENDING", "NOT_REGISTERED"],
  PENDING: ["REGISTERED", "FAILED", "BLOCKED"],
  FAILED: ["PENDING", "BLOCKED"],
  REGISTERED: ["CANCEL_PENDING"],
  CANCEL_PENDING: ["CANCELLED", "REGISTERED"],
  CANCELLED: [],
};

export function canTransitionFiscalStatus(
  from: FiscalRegistrationStatus,
  to: FiscalRegistrationStatus,
): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function assertFiscalStatusTransition(
  from: FiscalRegistrationStatus,
  to: FiscalRegistrationStatus,
): void {
  if (!canTransitionFiscalStatus(from, to)) {
    throw new FiscalError(
      "FISCAL_MAPPING_INVALID",
      `Cannot move a fiscal registration from ${from} to ${to}.`,
    );
  }
}

export type FiscalReadiness = {
  authReady: boolean;
  documentReady: false;
  connectionConfigured: boolean;
  credentialsConfigured: boolean;
  deviceConfigured: boolean;
  taxMappingsConfigured: boolean;
  itemMappingsConfigured: boolean;
  modeMappingsConfigured: boolean;
  buyerMappingsConfigured: boolean;
  registrationEnabled: false;
};

export function fiscalReadiness(input: {
  baseUrl: string;
  taxpayerTin: string;
  client: string;
  deviceId: string;
  credentialsConfigured: boolean;
  taxMapped: number;
  taxTotal: number;
  roomMapped: boolean;
  modeMapped: number;
  buyerMapped: number;
}): FiscalReadiness {
  const connectionConfigured =
    input.baseUrl.trim().length > 0 &&
    input.taxpayerTin.trim().length > 0 &&
    input.client.trim().length > 0;
  const deviceConfigured = input.deviceId.trim().length > 0;
  const taxMappingsConfigured = input.taxTotal > 0 && input.taxMapped >= input.taxTotal;
  const itemMappingsConfigured = input.roomMapped;
  const modeMappingsConfigured = input.modeMapped >= FISCAL_MODE_CONTEXTS.length;
  const buyerMappingsConfigured = input.buyerMapped > 0;
  return {
    authReady: connectionConfigured && input.credentialsConfigured,
    documentReady: false,
    connectionConfigured,
    credentialsConfigured: input.credentialsConfigured,
    deviceConfigured,
    taxMappingsConfigured,
    itemMappingsConfigured,
    modeMappingsConfigured,
    buyerMappingsConfigured,
    registrationEnabled: false,
  };
}

export type FiscalDbResult = {
  data: Record<string, unknown> | Record<string, unknown>[] | string | null;
  error: { message: string } | null;
};

export function fiscalRecord(data: FiscalDbResult["data"]): Record<string, unknown> | null {
  if (!data || typeof data === "string" || Array.isArray(data)) return null;
  return data;
}

export function fiscalRecords(data: FiscalDbResult["data"]): Record<string, unknown>[] {
  return Array.isArray(data) ? data : [];
}

export interface FiscalDbQuery extends Promise<FiscalDbResult> {
  select(columns?: string): FiscalDbQuery;
  eq(column: string, value: unknown): FiscalDbQuery;
  insert(values: Record<string, unknown> | Record<string, unknown>[]): FiscalDbQuery;
  update(values: Record<string, unknown>): FiscalDbQuery;
  upsert(values: Record<string, unknown>, options?: { onConflict?: string }): FiscalDbQuery;
  maybeSingle(): Promise<FiscalDbResult>;
  single(): Promise<FiscalDbResult>;
}

export interface FiscalDb {
  from(table: string): FiscalDbQuery;
  rpc(name: string, args: Record<string, unknown>): Promise<FiscalDbResult>;
  schema(name: string): FiscalDb;
}

export type FiscalCatalogRow = {
  id: string;
  name?: string;
  code?: string;
  amount?: number | string;
  charge_type?: string;
  pms_tax_id?: string | null;
  mapping_kind?: string;
  external_tax_code?: string;
  external_item_code?: string;
  external_unit?: string;
  nature_of_supplies?: string;
  harmonization_code?: string | null;
  charge_source?: string | null;
  department_id?: string | null;
  service_type_id?: string | null;
  is_default?: boolean;
  document_context?: string;
  external_mode?: string;
  active?: boolean;
};

export function requireExternalCode(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new FiscalError("FISCAL_MAPPING_INVALID", `${label} is required.`);
  }
  if (trimmed.length > 80) {
    throw new FiscalError("FISCAL_MAPPING_INVALID", `${label} is too long.`);
  }
  return trimmed;
}
