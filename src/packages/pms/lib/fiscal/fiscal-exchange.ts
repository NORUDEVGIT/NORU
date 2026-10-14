/**
 * Read-only fiscal API exchange model.
 *
 * Redaction here builds a copy for the inspector. It does not write snapshots,
 * rebuild a fiscal payload, or change registration state.
 */
import { redactFiscalText } from "./fiscal.types.ts";

const EXCHANGE_SECRET_KEY =
  /(authorization|password|username|token|bearer|secret|vault|service[_-]?role|api[_-]?key|cookie|session)/i;

export const FISCAL_EXCHANGE_LARGE_VALUE = 2_000;

export type FiscalExchangeSnapshotState = "ready" | "empty" | "invalid";

export type FiscalExchangeAttempt = {
  id: string;
  attemptNumber: number;
  startedAt: string | null;
  completedAt: string | null;
  httpStatus: number | null;
  outcome: "success" | "retryable_error" | "fatal_error" | "timeout";
  errorCode: string | null;
  errorMessage: string | null;
  externalStatus: string | null;
  requestState: FiscalExchangeSnapshotState;
  responseState: FiscalExchangeSnapshotState;
  requestSnapshot: unknown | null;
  responseSnapshot: unknown | null;
};

export type FiscalRegistrationExchange = {
  registration: {
    id: string;
    sourceType: string;
    sourceId: string;
    documentType: string;
    status: string;
    trnxId: string;
    externalStatus: string | null;
    externalIrn: string | null;
    externalRrn: string | null;
    externalId: string | null;
    externalDocumentNumber: string | null;
    createdAt: string | null;
    registeredAt: string | null;
    acknowledgedAt: string | null;
    attemptCount: number;
    nextAttemptAt: string | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    invoiceNumber: string | null;
    requestState: FiscalExchangeSnapshotState;
    responseState: FiscalExchangeSnapshotState;
    requestSnapshot: unknown | null;
    responseSnapshot: unknown | null;
  };
  attempts: FiscalExchangeAttempt[];
};

export function redactFiscalExchange(value: unknown): unknown {
  if (typeof value === "string") return redactFiscalText(value);
  if (Array.isArray(value)) return value.map((item) => redactFiscalExchange(item));
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = EXCHANGE_SECRET_KEY.test(key) ? "[REDACTED]" : redactFiscalExchange(item);
  }
  return output;
}

export function fiscalExchangeCopyText(value: unknown): string {
  return JSON.stringify(redactFiscalExchange(value), null, 2);
}

export function collapseFiscalExchangeValues(
  value: unknown,
  expanded: ReadonlySet<string> = new Set(),
  path = "",
): unknown {
  if (typeof value === "string") {
    if (value.length <= FISCAL_EXCHANGE_LARGE_VALUE || expanded.has(path)) return value;
    return `[large value — ${value.length} characters]`;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      collapseFiscalExchangeValues(item, expanded, `${path}[${index}]`),
    );
  }
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = collapseFiscalExchangeValues(item, expanded, path ? `${path}.${key}` : key);
  }
  return output;
}

export function prepareFiscalSnapshot(value: unknown): {
  state: FiscalExchangeSnapshotState;
  snapshot: unknown | null;
} {
  if (value == null) return { state: "empty", snapshot: null };
  if (typeof value === "string") {
    try {
      return prepareFiscalSnapshot(JSON.parse(value) as unknown);
    } catch {
      return { state: "invalid", snapshot: null };
    }
  }
  if (typeof value !== "object") return { state: "invalid", snapshot: null };
  return { state: "ready", snapshot: redactFiscalExchange(value) };
}

export function buildFiscalRegistrationExchange(input: {
  registration: Record<string, unknown>;
  attempts: Record<string, unknown>[];
  invoiceNumber: string | null;
}): FiscalRegistrationExchange {
  const request = prepareFiscalSnapshot(input.registration.request_snapshot);
  const response = prepareFiscalSnapshot(input.registration.response_snapshot);
  const attempts = input.attempts
    .map(mapAttempt)
    .sort((left, right) => left.attemptNumber - right.attemptNumber);
  return {
    registration: {
      id: text(input.registration.id) ?? "",
      sourceType: text(input.registration.source_type) ?? "",
      sourceId: text(input.registration.source_id) ?? "",
      documentType: text(input.registration.fiscal_document_type) ?? "",
      status: text(input.registration.status) ?? "",
      trnxId: text(input.registration.trnx_id) ?? "",
      externalStatus: text(input.registration.external_status),
      externalIrn: text(input.registration.external_irn),
      externalRrn: text(input.registration.external_rrn),
      externalId: text(input.registration.external_id),
      externalDocumentNumber: text(input.registration.external_document_number),
      createdAt: text(input.registration.created_at),
      registeredAt: text(input.registration.registered_at),
      acknowledgedAt: text(input.registration.acknowledged_at),
      attemptCount: numberOrZero(input.registration.attempt_count),
      nextAttemptAt: text(input.registration.next_attempt_at),
      lastErrorCode: text(input.registration.last_error_code),
      lastErrorMessage: text(input.registration.last_error_message),
      invoiceNumber: input.invoiceNumber,
      requestState: request.state,
      responseState: response.state,
      requestSnapshot: request.snapshot,
      responseSnapshot: response.snapshot,
    },
    attempts,
  };
}

function mapAttempt(row: Record<string, unknown>): FiscalExchangeAttempt {
  const request = prepareFiscalSnapshot(row.request_body);
  const response = prepareFiscalSnapshot(row.response_body);
  const outcome = attemptOutcome(row.outcome);
  return {
    id: text(row.id) ?? "",
    attemptNumber: numberOrZero(row.attempt_number),
    startedAt: text(row.started_at) ?? text(row.created_at),
    completedAt: text(row.completed_at),
    httpStatus: typeof row.http_status === "number" ? row.http_status : null,
    outcome,
    errorCode: text(row.error_code),
    errorMessage: text(row.error_message),
    externalStatus: statusField(response.snapshot),
    requestState: request.state,
    responseState: response.state,
    requestSnapshot: request.snapshot,
    responseSnapshot: response.snapshot,
  };
}

function attemptOutcome(value: unknown): FiscalExchangeAttempt["outcome"] {
  if (
    value === "success" ||
    value === "retryable_error" ||
    value === "fatal_error" ||
    value === "timeout"
  ) {
    return value;
  }
  return "fatal_error";
}

function statusField(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  return text((snapshot as Record<string, unknown>).status);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
