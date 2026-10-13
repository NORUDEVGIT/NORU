/**
 * Phase 2 guest B2C INV registration.
 *
 * Builds the payload from the frozen invoice, stores one stable registration,
 * and sends the stored snapshot. It does not change the invoice or the ledger.
 * The HTTP call happens after the registration row is saved.
 */
import { postFiscalReceiveRequest, type FiscalFetch } from "./fiscal-client.server.ts";
import {
  assessGuestInvoiceFiscal,
  fiscalPayloadHash,
  fiscalQrSrc,
  guestInvoiceTrnxId,
  parseFiscalInvoiceSuccess,
  parseFiscalRuleValidation,
  type FiscalInvPayload,
  type FiscalItemMapping,
  type FiscalTaxMapping,
  type GuestInvoiceFiscalAssessment,
} from "./fiscal-guest-invoice.ts";
import {
  FiscalError,
  classifyFiscalFailure,
  fiscalRecord,
  fiscalRecords,
  nextFiscalRetryAt,
  redactFiscalPayload,
  type FiscalConnectionConfig,
  type FiscalDb,
} from "./fiscal.types.ts";
import { getValidFiscalToken, invalidateFiscalToken } from "./fiscal-token.server.ts";

type Db = FiscalDb;

export type GuestInvoiceFiscalState = {
  status: "not_registered" | "queued" | "registered" | "failed" | "not_eligible";
  reasons: string[];
  missingTaxes: string[];
  missingItems: string[];
  missingMode: boolean;
  missingDevice: boolean;
  canRegister: boolean;
  canRetry: boolean;
  preview: GuestInvoiceFiscalAssessment extends infer T
    ? T extends { ok: true; preview: infer P }
      ? P | null
      : null
    : null;
  registration: {
    id: string;
    trnxId: string;
    documentNumber: string | null;
    irn: string | null;
    acknowledgedAt: string | null;
    registeredAt: string | null;
    lastError: string | null;
    qrSrc: string | null;
    qrStored: boolean;
  } | null;
};

export async function getGuestInvoiceFiscalState(
  db: Db,
  input: { restaurantId: string; invoiceId: string },
): Promise<GuestInvoiceFiscalState> {
  const invoice = await loadInvoice(db, input.restaurantId, input.invoiceId);
  const context = await loadFiscalContext(db, input.restaurantId);
  const assessment = assessGuestInvoiceFiscal(invoice.id, {
    issued: true,
    coverageScope: invoice.coverageScope,
    snapshot: invoice.snapshot,
    connection: context.connection,
    mode: context.mode,
    taxMappings: context.taxMappings,
    itemMappings: context.itemMappings,
  });
  const registration = await findRegistration(db, input.restaurantId, invoice.id);
  return presentState(assessment, registration);
}

export async function queueGuestInvoiceFiscal(
  db: Db,
  input: { restaurantId: string; invoiceId: string },
): Promise<GuestInvoiceFiscalState> {
  const invoice = await loadInvoice(db, input.restaurantId, input.invoiceId);
  const context = await loadFiscalContext(db, input.restaurantId);
  const assessment = assessGuestInvoiceFiscal(invoice.id, {
    issued: true,
    coverageScope: invoice.coverageScope,
    snapshot: invoice.snapshot,
    connection: context.connection,
    mode: context.mode,
    taxMappings: context.taxMappings,
    itemMappings: context.itemMappings,
  });
  if (!assessment.ok) return presentState(assessment, null);
  const existing = await findRegistration(db, input.restaurantId, invoice.id);
  if (existing?.status === "REGISTERED" || existing?.status === "PENDING") {
    return presentState(assessment, existing);
  }
  if (existing?.status === "FAILED" || existing?.status === "BLOCKED") {
    // Keep the stored request. A failed send may already have reached the provider.
    await db
      .from("fiscal_registrations")
      .update({
        status: "PENDING",
        next_attempt_at: new Date(Date.now() - 1000).toISOString(),
        last_error_code: null,
      })
      .eq("id", existing.id);
    const refreshed = await findRegistration(db, input.restaurantId, invoice.id);
    return presentState(assessment, refreshed);
  }
  const inserted = await db
    .from("fiscal_registrations")
    .insert({
      restaurant_id: input.restaurantId,
      integration_id: context.integrationId,
      device_id_snapshot: context.connection.deviceId,
      taxpayer_tin_snapshot: context.connection.taxpayerTin,
      client_snapshot: context.connection.client,
      source_type: "guest_invoice",
      source_id: invoice.id,
      fiscal_document_type: "INV",
      trnx_id: guestInvoiceTrnxId(invoice.id),
      status: "PENDING",
      request_snapshot: assessment.payload,
      request_hash: fiscalPayloadHash(assessment.payload),
      attempt_count: 0,
      next_attempt_at: new Date(Date.now() - 1000).toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (inserted.error) {
    const raced = await findRegistration(db, input.restaurantId, invoice.id);
    if (raced) return presentState(assessment, raced);
    throw new FiscalError("FISCAL_NOT_ELIGIBLE", "The fiscal registration could not be queued.");
  }
  const created = await findRegistration(db, input.restaurantId, invoice.id);
  return presentState(assessment, created);
}

export async function sendClaimedGuestInvoice(
  db: Db,
  row: Record<string, unknown>,
  fetchImpl?: FiscalFetch,
): Promise<void> {
  return sendStoredFiscalRequest(db, row, fetchImpl, "invoice");
}

export async function sendStoredFiscalRequest(
  db: Db,
  row: Record<string, unknown>,
  fetchImpl: FiscalFetch | undefined,
  documentLabel: string,
): Promise<void> {
  const registrationId = String(row.id ?? "");
  const integrationId = String(row.integration_id ?? "");
  const restaurantId = String(row.restaurant_id ?? "");
  const payload = row.request_snapshot;
  const started = new Date();
  const attemptNumber = Number(row.attempt_count ?? 0) + 1;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    await finishAttempt(db, {
      registrationId,
      attemptNumber,
      payload: { note: "The stored fiscal request is missing." },
      httpStatus: null,
      responseBody: null,
      outcome: "fatal_error",
      code: "FISCAL_RESPONSE_INVALID",
      message: "The stored fiscal request is missing.",
      started,
      latencyMs: 0,
      registered: null,
    });
    return;
  }
  const config = await loadConnection(db, integrationId);
  try {
    const response = await sendWithToken(db, {
      integrationId,
      restaurantId,
      config,
      payload,
      fetchImpl,
    });
    const rule = parseFiscalRuleValidation(response.body);
    if (rule) {
      await finishAttempt(db, {
        registrationId,
        attemptNumber,
        payload,
        httpStatus: response.httpStatus,
        responseBody: redactFiscalPayload(response.body),
        outcome: "fatal_error",
        code: "FISCAL_PROVIDER_REJECTED",
        message: rule,
        started,
        latencyMs: response.latencyMs,
        registered: null,
        retryable: false,
      });
      return;
    }
    const parsed =
      response.httpStatus >= 200 && response.httpStatus < 300
        ? parseFiscalInvoiceSuccess(response.body)
        : null;
    if (parsed?.ok) {
      await finishAttempt(db, {
        registrationId,
        attemptNumber,
        payload,
        httpStatus: response.httpStatus,
        responseBody: redactFiscalPayload(response.body),
        outcome: "success",
        code: null,
        message: null,
        started,
        latencyMs: response.latencyMs,
        registered: parsed,
      });
      return;
    }
    const code =
      response.httpStatus === 401
        ? "FISCAL_AUTH_FAILED"
        : response.httpStatus === 429 || response.httpStatus >= 500
          ? "FISCAL_HTTP_ERROR"
          : parsed && !parsed.ok
            ? "FISCAL_PROVIDER_REJECTED"
            : "FISCAL_RESPONSE_INVALID";
    const classified = classifyFiscalFailure({
      code,
      httpStatus: response.httpStatus,
    });
    await finishAttempt(db, {
      registrationId,
      attemptNumber,
      payload,
      httpStatus: response.httpStatus,
      responseBody: redactFiscalPayload(response.body),
      outcome: classified.outcome,
      code,
      message:
        parsed && !parsed.ok
          ? parsed.message
          : code === "FISCAL_AUTH_FAILED"
            ? "Authentication was rejected by the fiscal service."
            : code === "FISCAL_HTTP_ERROR"
              ? "The fiscal service returned an HTTP error."
              : `The fiscal service did not accept the ${documentLabel}.`,
      started,
      latencyMs: response.latencyMs,
      registered: null,
      retryable: classified.retryable,
    });
  } catch (error) {
    const fiscal = error instanceof FiscalError ? error : null;
    const code = fiscal?.code === "FISCAL_TIMEOUT" ? "FISCAL_TIMEOUT" : "FISCAL_NETWORK_ERROR";
    const classified = classifyFiscalFailure({ code });
    await finishAttempt(db, {
      registrationId,
      attemptNumber,
      payload,
      httpStatus: null,
      responseBody: null,
      outcome: classified.outcome,
      code,
      message: fiscal?.message ?? "NORU could not reach the fiscal service.",
      started,
      latencyMs: Date.now() - started.getTime(),
      registered: null,
      retryable: classified.retryable,
    });
  }
}

async function sendWithToken(
  db: Db,
  input: {
    integrationId: string;
    restaurantId: string;
    config: Pick<FiscalConnectionConfig, "baseUrl" | "taxpayerTin" | "client">;
    payload: unknown;
    fetchImpl?: FiscalFetch;
  },
) {
  const firstToken = await getValidFiscalToken(db, {
    integrationId: input.integrationId,
    restaurantId: input.restaurantId,
    config: input.config,
    fetchImpl: input.fetchImpl,
  });
  const first = await postFiscalReceiveRequest({
    baseUrl: input.config.baseUrl,
    accessToken: firstToken.accessToken,
    payload: input.payload,
    fetchImpl: input.fetchImpl,
  });
  if (first.httpStatus !== 401) return first;
  await invalidateFiscalToken(db, input.integrationId);
  const refreshed = await getValidFiscalToken(db, {
    integrationId: input.integrationId,
    restaurantId: input.restaurantId,
    config: input.config,
    fetchImpl: input.fetchImpl,
  });
  return postFiscalReceiveRequest({
    baseUrl: input.config.baseUrl,
    accessToken: refreshed.accessToken,
    payload: input.payload,
    fetchImpl: input.fetchImpl,
  });
}

async function finishAttempt(
  db: Db,
  input: {
    registrationId: string;
    attemptNumber: number;
    payload: unknown;
    httpStatus: number | null;
    responseBody: unknown;
    outcome: "success" | "retryable_error" | "fatal_error" | "timeout";
    code: string | null;
    message: string | null;
    started: Date;
    latencyMs: number;
    registered: ReturnType<typeof parseFiscalInvoiceSuccess> | null;
    retryable?: boolean;
  },
) {
  await db.from("fiscal_registration_attempts").insert({
    registration_id: input.registrationId,
    attempt_number: input.attemptNumber,
    endpoint: "receive_request",
    request_hash: fiscalPayloadHash(input.payload as FiscalInvPayload),
    request_body: redactFiscalPayload(input.payload),
    http_status: input.httpStatus,
    response_body: input.responseBody,
    outcome: input.outcome,
    error_code: input.code,
    error_message: input.message,
    started_at: input.started.toISOString(),
    completed_at: new Date().toISOString(),
    latency_ms: input.latencyMs,
  });
  const success = input.registered && input.registered.ok ? input.registered : null;
  const next = input.retryable ? nextFiscalRetryAt(input.attemptNumber, input.started) : null;
  await db
    .from("fiscal_registrations")
    .update(
      success
        ? {
            status: "REGISTERED",
            external_irn: success.irn,
            external_document_number: success.documentNumber,
            external_status: success.externalStatus,
            signed_qr: success.signedQr,
            signed_document: success.signedInvoice,
            acknowledged_at: success.acknowledgedAt,
            acknowledged_at_raw: success.acknowledgedAtRaw,
            registered_at: new Date().toISOString(),
            response_snapshot: input.responseBody,
            attempt_count: input.attemptNumber,
            next_attempt_at: null,
            last_error_code: null,
            last_error_message: null,
          }
        : {
            status: "FAILED",
            attempt_count: input.attemptNumber,
            next_attempt_at: next ? next.toISOString() : null,
            last_error_code: input.code,
            last_error_message: input.message,
            response_snapshot: input.responseBody,
          },
    )
    .eq("id", input.registrationId);
}

async function loadInvoice(db: Db, restaurantId: string, invoiceId: string) {
  const result = await db
    .from("guest_folio_invoices")
    .select("id, restaurant_id, snapshot, coverage_scope")
    .eq("id", invoiceId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const row = fiscalRecord(result.data);
  if (result.error || !row || typeof row.id !== "string") {
    throw new FiscalError("FISCAL_NOT_ELIGIBLE", "That issued guest invoice was not found.");
  }
  return {
    id: row.id,
    snapshot: row.snapshot,
    coverageScope: typeof row.coverage_scope === "string" ? row.coverage_scope : "",
  };
}

async function loadFiscalContext(db: Db, restaurantId: string) {
  const integration = await db
    .from("pms_integrations")
    .select("id, enabled, environment, config")
    .eq("restaurant_id", restaurantId)
    .eq("category", "fiscal")
    .eq("provider", "erp_fiscal")
    .maybeSingle();
  const row = fiscalRecord(integration.data);
  if (!row || typeof row.id !== "string") {
    return emptyContext();
  }
  const config = record(row.config);
  const [taxes, items, mode, credentials] = await Promise.all([
    db.from("fiscal_tax_code_mappings").select("*").eq("integration_id", row.id),
    db.from("fiscal_item_mappings").select("*").eq("integration_id", row.id),
    db
      .from("fiscal_mode_mappings")
      .select("external_mode, active")
      .eq("integration_id", row.id)
      .eq("document_context", "guest_invoice")
      .maybeSingle(),
    db
      .from("fiscal_credential_refs")
      .select("integration_id")
      .eq("integration_id", row.id)
      .maybeSingle(),
  ]);
  const modeRow = fiscalRecord(mode.data);
  return {
    integrationId: row.id,
    connection: {
      enabled: row.enabled !== false,
      taxpayerTin: String(config?.taxpayerTin ?? ""),
      client: String(config?.client ?? ""),
      deviceId: String(config?.deviceId ?? ""),
      credentialsConfigured: Boolean(fiscalRecord(credentials.data)),
    },
    mode:
      modeRow && modeRow.active !== false && typeof modeRow.external_mode === "string"
        ? modeRow.external_mode
        : null,
    taxMappings: fiscalRecords(taxes.data).map(taxMapping),
    itemMappings: fiscalRecords(items.data).map(itemMapping),
  };
}

function emptyContext() {
  return {
    integrationId: "",
    connection: {
      enabled: false,
      taxpayerTin: "",
      client: "",
      deviceId: "",
      credentialsConfigured: false,
    },
    mode: null as string | null,
    taxMappings: [] as FiscalTaxMapping[],
    itemMappings: [] as FiscalItemMapping[],
  };
}

async function loadConnection(db: Db, integrationId: string) {
  const result = await db
    .from("pms_integrations")
    .select("config")
    .eq("id", integrationId)
    .maybeSingle();
  const config = record(fiscalRecord(result.data)?.config);
  return {
    baseUrl: String(config?.baseUrl ?? ""),
    taxpayerTin: String(config?.taxpayerTin ?? ""),
    client: String(config?.client ?? ""),
  };
}

async function findRegistration(db: Db, restaurantId: string, invoiceId: string) {
  const result = await db
    .from("fiscal_registrations")
    .select(
      "id, status, trnx_id, external_irn, external_document_number, acknowledged_at, registered_at, signed_qr, last_error_message",
    )
    .eq("restaurant_id", restaurantId)
    .eq("source_type", "guest_invoice")
    .eq("source_id", invoiceId)
    .eq("fiscal_document_type", "INV")
    .maybeSingle();
  const row = fiscalRecord(result.data);
  if (!row || row.status === "CANCELLED") return null;
  return {
    id: String(row.id ?? ""),
    status: String(row.status ?? ""),
    trnxId: String(row.trnx_id ?? ""),
    documentNumber:
      typeof row.external_document_number === "string" ? row.external_document_number : null,
    irn: typeof row.external_irn === "string" ? row.external_irn : null,
    acknowledgedAt: typeof row.acknowledged_at === "string" ? row.acknowledged_at : null,
    registeredAt: typeof row.registered_at === "string" ? row.registered_at : null,
    signedQr: typeof row.signed_qr === "string" ? row.signed_qr : null,
    lastError: typeof row.last_error_message === "string" ? row.last_error_message : null,
  };
}

function presentState(
  assessment: GuestInvoiceFiscalAssessment,
  registration: Awaited<ReturnType<typeof findRegistration>>,
): GuestInvoiceFiscalState {
  const base = {
    reasons: assessment.ok ? [] : assessment.reasons,
    missingTaxes: assessment.ok ? [] : assessment.missingTaxes,
    missingItems: assessment.ok ? [] : assessment.missingItems,
    missingMode: assessment.ok ? false : assessment.missingMode,
    missingDevice: assessment.ok ? false : assessment.missingDevice,
    preview: assessment.ok ? assessment.preview : null,
  };
  if (!registration) {
    return {
      ...base,
      status: assessment.ok ? "not_registered" : "not_eligible",
      canRegister: assessment.ok,
      canRetry: false,
      registration: null,
    };
  }
  const view = {
    id: registration.id,
    trnxId: registration.trnxId,
    documentNumber: registration.documentNumber,
    irn: registration.irn,
    acknowledgedAt: registration.acknowledgedAt,
    registeredAt: registration.registeredAt,
    lastError: registration.lastError,
    qrSrc: fiscalQrSrc(registration.signedQr),
    qrStored: Boolean(registration.signedQr),
  };
  if (registration.status === "REGISTERED") {
    return {
      ...base,
      status: "registered",
      canRegister: false,
      canRetry: false,
      registration: view,
    };
  }
  if (registration.status === "PENDING") {
    return { ...base, status: "queued", canRegister: false, canRetry: false, registration: view };
  }
  return {
    ...base,
    status: assessment.ok ? "failed" : "not_eligible",
    canRegister: false,
    canRetry: assessment.ok,
    registration: view,
  };
}

function taxMapping(row: Record<string, unknown>): FiscalTaxMapping {
  return {
    mappingKind: row.mapping_kind === "NO_TAX" ? "NO_TAX" : "TAX",
    pmsTaxId: typeof row.pms_tax_id === "string" ? row.pms_tax_id : null,
    externalTaxCode: String(row.external_tax_code ?? ""),
    active: row.active !== false,
  };
}

function itemMapping(row: Record<string, unknown>): FiscalItemMapping {
  return {
    serviceTypeId: typeof row.service_type_id === "string" ? row.service_type_id : null,
    departmentId: typeof row.department_id === "string" ? row.department_id : null,
    chargeSource: typeof row.charge_source === "string" ? row.charge_source : null,
    isDefault: row.is_default === true,
    externalItemCode: String(row.external_item_code ?? ""),
    externalUnit: String(row.external_unit ?? ""),
    natureOfSupplies: String(row.nature_of_supplies ?? ""),
    harmonizationCode: typeof row.harmonization_code === "string" ? row.harmonization_code : null,
    active: row.active !== false,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
