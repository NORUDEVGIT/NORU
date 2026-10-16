/**
 * Phase 2 guest INV registration.
 *
 * Builds the payload from the frozen invoice, stores one stable registration,
 * and sends the stored snapshot. B2C is the default. B2B copies BuyerDetails
 * from the selected saved tax identity when the row is first created. A later
 * retry sends that stored snapshot and does not read the identity again.
 * It does not change the invoice or the ledger.
 * The HTTP call happens after the registration row is saved.
 */
import {
  buildGuestBuyerDetails,
  guestLegalNamePrefill,
  guestTaxIdentitySelectable,
  type GuestFiscalCustomerType,
  type GuestTaxBuyerDetails,
} from "../guest-tax-identities.ts";
import { postFiscalReceiveRequest, type FiscalFetch } from "./fiscal-client.server.ts";
import { fiscalProviderPayload } from "./fiscal-line-expansion.ts";
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
import { frozenFiscalMode, type FiscalSettlementSummary } from "./fiscal-document-mode.ts";
import { allocateUnmappedManualCodes, loadFiscalSettlement } from "./fiscal-settlement.server.ts";

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
  choiceLocked: boolean;
  guestId: string | null;
  guestPrefill: GuestTaxIdentityPrefill | null;
  taxIdentities: GuestTaxIdentityChoice[];
  settlement: FiscalSettlementSummary | null;
};

export type GuestTaxIdentityPrefill = {
  legalName: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  region: string | null;
};

export type GuestTaxIdentityChoice = {
  id: string;
  legalName: string;
  tin: string;
  registrationNumber: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  region: string | null;
  isDefault: boolean;
};

export async function getGuestInvoiceFiscalState(
  db: Db,
  input: { restaurantId: string; invoiceId: string },
): Promise<GuestInvoiceFiscalState> {
  const invoice = await loadInvoice(db, input.restaurantId, input.invoiceId);
  const context = await loadFiscalContext(db, input.restaurantId);
  const registration = await findRegistration(db, input.restaurantId, invoice.id);
  const settlement = registration
    ? null
    : await loadFiscalSettlement(db, {
        restaurantId: input.restaurantId,
        invoiceId: invoice.id,
        snapshot: invoice.snapshot,
        allocationTable: "guest_payment_invoice_allocations",
      });
  const assessment = assessGuestInvoiceFiscal(invoice.id, {
    issued: true,
    coverageScope: invoice.coverageScope,
    snapshot: invoice.snapshot,
    connection: context.connection,
    mode: context.mode,
    taxMappings: context.taxMappings,
    itemMappings: context.itemMappings,
    documentMode: registration ? frozenFiscalMode(registration.request) : settlement?.mode,
    allowPreviewManualCode: true,
  });
  const state = presentState(assessment, registration, settlement);
  if (registration) return { ...state, choiceLocked: true, taxIdentities: [] };
  const guestId = await invoiceGuestId(db, input.restaurantId, invoice.snapshot);
  return {
    ...state,
    guestId,
    guestPrefill: guestId ? await guestTaxPrefill(db, input.restaurantId, guestId) : null,
    taxIdentities: guestId ? await listActiveTaxIdentities(db, input.restaurantId, guestId) : [],
  };
}

export async function queueGuestInvoiceFiscal(
  db: Db,
  input: {
    restaurantId: string;
    invoiceId: string;
    fiscalType?: GuestFiscalCustomerType;
    taxIdentityId?: string | null;
  },
): Promise<GuestInvoiceFiscalState> {
  const invoice = await loadInvoice(db, input.restaurantId, input.invoiceId);
  const context = await loadFiscalContext(db, input.restaurantId);
  const existing = await findRegistration(db, input.restaurantId, invoice.id);
  const settlement = existing
    ? null
    : await loadFiscalSettlement(db, {
        restaurantId: input.restaurantId,
        invoiceId: invoice.id,
        snapshot: invoice.snapshot,
        allocationTable: "guest_payment_invoice_allocations",
      });
  const frozenMode = existing ? frozenFiscalMode(existing.request) : null;
  const fiscalInput = {
    issued: true,
    coverageScope: invoice.coverageScope,
    snapshot: invoice.snapshot,
    connection: context.connection,
    mode: context.mode,
    taxMappings: context.taxMappings,
    itemMappings: context.itemMappings,
    documentMode: frozenMode ?? settlement?.mode,
    allowPreviewManualCode: true,
  };
  const assessment = assessGuestInvoiceFiscal(invoice.id, fiscalInput);
  if (!assessment.ok) return presentState(assessment, null, settlement);
  if (existing?.status === "REGISTERED" || existing?.status === "PENDING") {
    return presentState(assessment, existing, null);
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
    return presentState(assessment, refreshed, null);
  }
  const allocated = await allocateUnmappedManualCodes(
    db,
    input.restaurantId,
    invoice.snapshot,
    context.itemMappings,
    "guest",
  );
  if (!allocated.ok) {
    return presentState(
      {
        ok: false,
        reasons: [allocated.reason],
        missingTaxes: [],
        missingItems: [],
        missingMode: false,
        missingDevice: false,
      },
      null,
      settlement,
    );
  }
  const storedInput = {
    ...fiscalInput,
    manualItemCodes: allocated.codes,
    allowPreviewManualCode: false,
  };
  let queued = assessGuestInvoiceFiscal(invoice.id, storedInput);
  if (!queued.ok) return presentState(queued, null, settlement);
  if (input.fiscalType === "B2B") {
    const guestId = await invoiceGuestId(db, input.restaurantId, invoice.snapshot);
    const identity =
      guestId && input.taxIdentityId
        ? await loadTaxIdentity(db, input.restaurantId, guestId, input.taxIdentityId)
        : null;
    const buyer: GuestTaxBuyerDetails | null = identity ? buildGuestBuyerDetails(identity) : null;
    const selectable =
      guestId != null &&
      identity != null &&
      guestTaxIdentitySelectable(
        {
          restaurantId: input.restaurantId,
          guestProfileId: identity.guestProfileId,
          isActive: identity.isActive,
          legalName: identity.legalName,
          tin: identity.tin,
        },
        { restaurantId: input.restaurantId, guestProfileId: guestId },
      );
    if (!selectable || !buyer) {
      return presentState(
        {
          ok: false,
          reasons: ["Select an active tax identity for this guest."],
          missingTaxes: [],
          missingItems: [],
          missingMode: false,
          missingDevice: false,
        },
        null,
        settlement,
      );
    }
    queued = assessGuestInvoiceFiscal(invoice.id, {
      ...storedInput,
      fiscalCustomerType: "B2B",
      buyer,
    });
    if (!queued.ok) return presentState(queued, null, settlement);
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
      request_snapshot: queued.payload,
      request_hash: fiscalPayloadHash(queued.payload),
      attempt_count: 0,
      next_attempt_at: new Date(Date.now() - 1000).toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (inserted.error) {
    const raced = await findRegistration(db, input.restaurantId, invoice.id);
    if (raced) return presentState(assessment, raced, null);
    throw new FiscalError("FISCAL_NOT_ELIGIBLE", "The fiscal registration could not be queued.");
  }
  const created = await findRegistration(db, input.restaurantId, invoice.id);
  return presentState(queued, created, null);
}

export async function sendClaimedGuestInvoice(
  db: Db,
  row: Record<string, unknown>,
  fetchImpl?: FiscalFetch,
): Promise<void> {
  return sendStoredFiscalRequest(db, row, fetchImpl, "invoice");
}

type StoredFiscalSuccess = {
  ok: true;
  irn?: string | null;
  documentNumber?: string | null;
  externalId?: string | null;
  externalRrn?: string | null;
  acknowledgedAtRaw: string | null;
  acknowledgedAt: string | null;
  signedQr: string | null;
  signedInvoice: string | null;
  externalStatus: string;
};

export async function sendStoredFiscalRequest(
  db: Db,
  row: Record<string, unknown>,
  fetchImpl: FiscalFetch | undefined,
  documentLabel: string,
  endpoint = "receive_request",
  parseSuccess: (
    body: unknown,
  ) =>
    | StoredFiscalSuccess
    | { ok: false; fatal: boolean; message: string } = parseFiscalInvoiceSuccess,
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
      endpoint,
    });
    return;
  }
  const config = await loadConnection(db, integrationId);
  const wirePayload = fiscalProviderPayload(payload);
  try {
    const response = await sendWithToken(db, {
      integrationId,
      restaurantId,
      config,
      payload: wirePayload,
      fetchImpl,
      endpoint,
    });
    const rule = parseFiscalRuleValidation(response.body);
    if (rule) {
      await finishAttempt(db, {
        registrationId,
        attemptNumber,
        payload: wirePayload,
        httpStatus: response.httpStatus,
        responseBody: redactFiscalPayload(response.body),
        outcome: "fatal_error",
        code: "FISCAL_PROVIDER_REJECTED",
        message: rule,
        started,
        latencyMs: response.latencyMs,
        registered: null,
        retryable: false,
        endpoint,
      });
      return;
    }
    const parsed =
      response.httpStatus >= 200 && response.httpStatus < 300 ? parseSuccess(response.body) : null;
    if (parsed?.ok) {
      await finishAttempt(db, {
        registrationId,
        attemptNumber,
        payload: wirePayload,
        httpStatus: response.httpStatus,
        responseBody: redactFiscalPayload(response.body),
        outcome: "success",
        code: null,
        message: null,
        started,
        latencyMs: response.latencyMs,
        registered: parsed,
        endpoint,
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
      payload: wirePayload,
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
      endpoint,
    });
  } catch (error) {
    const fiscal = error instanceof FiscalError ? error : null;
    const code = fiscal?.code === "FISCAL_TIMEOUT" ? "FISCAL_TIMEOUT" : "FISCAL_NETWORK_ERROR";
    const classified = classifyFiscalFailure({ code });
    await finishAttempt(db, {
      registrationId,
      attemptNumber,
      payload: wirePayload,
      httpStatus: null,
      responseBody: null,
      outcome: classified.outcome,
      code,
      message: fiscal?.message ?? "NORU could not reach the fiscal service.",
      started,
      latencyMs: Date.now() - started.getTime(),
      registered: null,
      retryable: classified.retryable,
      endpoint,
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
    endpoint: string;
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
    path: input.endpoint,
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
    path: input.endpoint,
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
    registered: StoredFiscalSuccess | { ok: false; fatal: boolean; message: string } | null;
    retryable?: boolean;
    endpoint?: string;
  },
) {
  await db.from("fiscal_registration_attempts").insert({
    registration_id: input.registrationId,
    attempt_number: input.attemptNumber,
    endpoint: input.endpoint ?? "receive_request",
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
  const registered = success
    ? {
        status: "REGISTERED",
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
        ...(success.irn ? { external_irn: success.irn } : {}),
        ...(success.documentNumber ? { external_document_number: success.documentNumber } : {}),
        ...(success.externalId ? { external_id: success.externalId } : {}),
        ...(success.externalRrn ? { external_rrn: success.externalRrn } : {}),
      }
    : null;
  await db
    .from("fiscal_registrations")
    .update(
      registered ?? {
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
      "id, status, trnx_id, external_irn, external_document_number, acknowledged_at, registered_at, signed_qr, last_error_message, request_snapshot",
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
    request: row.request_snapshot ?? null,
  };
}

function presentState(
  assessment: GuestInvoiceFiscalAssessment,
  registration: Awaited<ReturnType<typeof findRegistration>>,
  settlement: FiscalSettlementSummary | null,
): GuestInvoiceFiscalState {
  const base = {
    reasons: assessment.ok ? [] : assessment.reasons,
    missingTaxes: assessment.ok ? [] : assessment.missingTaxes,
    missingItems: assessment.ok ? [] : assessment.missingItems,
    missingMode: assessment.ok ? false : assessment.missingMode,
    missingDevice: assessment.ok ? false : assessment.missingDevice,
    preview: assessment.ok ? assessment.preview : null,
    settlement: registration ? null : settlement,
  };
  if (!registration) {
    return {
      ...base,
      status: assessment.ok ? "not_registered" : "not_eligible",
      canRegister: assessment.ok,
      canRetry: false,
      registration: null,
      choiceLocked: false,
      guestId: null,
      guestPrefill: null,
      taxIdentities: [],
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
      choiceLocked: true,
      guestId: null,
      guestPrefill: null,
      taxIdentities: [],
    };
  }
  if (registration.status === "PENDING") {
    return {
      ...base,
      status: "queued",
      canRegister: false,
      canRetry: false,
      registration: view,
      choiceLocked: true,
      guestId: null,
      guestPrefill: null,
      taxIdentities: [],
    };
  }
  return {
    ...base,
    status: assessment.ok ? "failed" : "not_eligible",
    canRegister: false,
    canRetry: assessment.ok,
    registration: view,
    choiceLocked: true,
    guestId: null,
    guestPrefill: null,
    taxIdentities: [],
  };
}

async function invoiceGuestId(db: Db, restaurantId: string, snapshot: unknown) {
  const folio = record(record(snapshot)?.folio);
  const folioId = typeof folio?.id === "string" ? folio.id : null;
  if (!folioId) return null;
  const result = await db
    .from("guest_folios")
    .select("guest_id")
    .eq("id", folioId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (result.error) return null;
  const guestId = fiscalRecord(result.data)?.guest_id;
  return typeof guestId === "string" ? guestId : null;
}

async function guestTaxPrefill(
  db: Db,
  restaurantId: string,
  guestProfileId: string,
): Promise<GuestTaxIdentityPrefill | null> {
  const result = await db
    .from("guest_profiles")
    .select("first_name, middle_name, last_name, phone, email, city, region")
    .eq("id", guestProfileId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (result.error) return null;
  const row = fiscalRecord(result.data);
  if (!row) return null;
  return {
    legalName: guestLegalNamePrefill({
      firstName: typeof row.first_name === "string" ? row.first_name : "",
      middleName: typeof row.middle_name === "string" ? row.middle_name : null,
      lastName: typeof row.last_name === "string" ? row.last_name : null,
    }),
    phone: optionalText(row.phone),
    email: optionalText(row.email),
    city: optionalText(row.city),
    region: optionalText(row.region),
  };
}

async function listActiveTaxIdentities(
  db: Db,
  restaurantId: string,
  guestProfileId: string,
): Promise<GuestTaxIdentityChoice[]> {
  const result = await db
    .from("guest_tax_identities")
    .select(
      "id, legal_name, tin, registration_number, phone, email, city, region, is_default, is_active",
    )
    .eq("restaurant_id", restaurantId)
    .eq("guest_profile_id", guestProfileId)
    .eq("is_active", true);
  if (result.error) return [];
  return fiscalRecords(result.data).flatMap((row) => {
    if (typeof row.id !== "string" || row.is_active === false) return [];
    const legalName = typeof row.legal_name === "string" ? row.legal_name : "";
    const tin = typeof row.tin === "string" ? row.tin : "";
    if (legalName.trim().length === 0 || tin.trim().length === 0) return [];
    return [
      {
        id: row.id,
        legalName,
        tin,
        registrationNumber: optionalText(row.registration_number),
        phone: optionalText(row.phone),
        email: optionalText(row.email),
        city: optionalText(row.city),
        region: optionalText(row.region),
        isDefault: row.is_default === true,
      },
    ];
  });
}

async function loadTaxIdentity(
  db: Db,
  restaurantId: string,
  guestProfileId: string,
  identityId: string,
) {
  const result = await db
    .from("guest_tax_identities")
    .select(
      "id, restaurant_id, guest_profile_id, legal_name, tin, registration_number, phone, email, city, region, is_active",
    )
    .eq("id", identityId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (result.error) return null;
  const row = fiscalRecord(result.data);
  if (!row || row.guest_profile_id !== guestProfileId || row.is_active !== true) return null;
  return {
    guestProfileId,
    isActive: true,
    legalName: typeof row.legal_name === "string" ? row.legal_name : "",
    tin: typeof row.tin === "string" ? row.tin : "",
    registrationNumber: optionalText(row.registration_number),
    phone: optionalText(row.phone),
    email: optionalText(row.email),
    city: optionalText(row.city),
    region: optionalText(row.region),
  };
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function taxMapping(row: Record<string, unknown>): FiscalTaxMapping {
  return {
    mappingKind: row.mapping_kind === "NO_TAX" ? "NO_TAX" : "TAX",
    pmsTaxId: typeof row.pms_tax_id === "string" ? row.pms_tax_id : null,
    externalTaxCode: String(row.external_tax_code ?? ""),
    active: row.active !== false,
    fiscalTreatment: row.fiscal_treatment === "SEPARATE_ITEM" ? "SEPARATE_ITEM" : "SAME_LINE_TAX",
    externalItemCode: typeof row.external_item_code === "string" ? row.external_item_code : null,
    externalUnit: typeof row.external_unit === "string" ? row.external_unit : null,
    natureOfSupplies: typeof row.nature_of_supplies === "string" ? row.nature_of_supplies : null,
    harmonizationCode: typeof row.harmonization_code === "string" ? row.harmonization_code : null,
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
