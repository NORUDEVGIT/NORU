/**
 * Phase 6 company B2B INV registration.
 *
 * Builds one request from the frozen company invoice and stores it on
 * fiscal_registrations. Retries resend that stored request. This module does
 * not update the invoice, the company profile, or any ledger row.
 */
import type { FiscalFetch } from "./fiscal-client.server.ts";
import { sendStoredFiscalRequest } from "./fiscal-guest-invoice.server.ts";
import {
  assessCompanyInvoiceFiscal,
  companyInvoiceTrnxId,
  companyPreviewFromPayload,
  type CompanyInvoiceFiscalAssessment,
  type CompanyInvoiceFiscalPreview,
} from "./fiscal-company-invoice.ts";
import {
  fiscalPayloadHash,
  fiscalQrSrc,
  type FiscalItemMapping,
  type FiscalTaxMapping,
} from "./fiscal-guest-invoice.ts";
import { FiscalError, fiscalRecord, fiscalRecords, type FiscalDb } from "./fiscal.types.ts";

type Db = FiscalDb;

export type CompanyInvoiceFiscalState = {
  status: "not_registered" | "queued" | "registered" | "failed" | "not_eligible";
  reasons: string[];
  missingTaxes: string[];
  missingItems: string[];
  missingDevice: boolean;
  canRegister: boolean;
  canRetry: boolean;
  preview: CompanyInvoiceFiscalPreview | null;
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

export async function getCompanyInvoiceFiscalState(
  db: Db,
  input: { restaurantId: string; invoiceId: string },
): Promise<CompanyInvoiceFiscalState> {
  const invoice = await loadInvoice(db, input.restaurantId, input.invoiceId);
  const context = await loadFiscalContext(db, input.restaurantId);
  const assessment = assessCompanyInvoiceFiscal(invoice.id, {
    issued: true,
    snapshot: invoice.snapshot,
    connection: context.connection,
    taxMappings: context.taxMappings,
    itemMappings: context.itemMappings,
  });
  const registration = await findRegistration(db, input.restaurantId, invoice.id);
  return presentState(assessment, registration, invoice.invoiceNumber);
}

export async function queueCompanyInvoiceFiscal(
  db: Db,
  input: { restaurantId: string; invoiceId: string },
): Promise<CompanyInvoiceFiscalState> {
  const invoice = await loadInvoice(db, input.restaurantId, input.invoiceId);
  const context = await loadFiscalContext(db, input.restaurantId);
  const assessment = assessCompanyInvoiceFiscal(invoice.id, {
    issued: true,
    snapshot: invoice.snapshot,
    connection: context.connection,
    taxMappings: context.taxMappings,
    itemMappings: context.itemMappings,
  });
  const existing = await findRegistration(db, input.restaurantId, invoice.id);
  if (existing?.status === "REGISTERED" || existing?.status === "PENDING") {
    return presentState(assessment, existing, invoice.invoiceNumber);
  }
  if (!assessment.ok) return presentState(assessment, existing, invoice.invoiceNumber);
  if (existing?.status === "FAILED" || existing?.status === "BLOCKED") {
    await db
      .from("fiscal_registrations")
      .update({
        status: "PENDING",
        next_attempt_at: new Date(Date.now() - 1000).toISOString(),
        last_error_code: null,
      })
      .eq("id", existing.id);
    const refreshed = await findRegistration(db, input.restaurantId, invoice.id);
    return presentState(assessment, refreshed, invoice.invoiceNumber);
  }
  const inserted = await db
    .from("fiscal_registrations")
    .insert({
      restaurant_id: input.restaurantId,
      integration_id: context.integrationId,
      device_id_snapshot: context.connection.deviceId,
      taxpayer_tin_snapshot: context.connection.taxpayerTin,
      client_snapshot: context.connection.client,
      source_type: "account_invoice",
      source_id: invoice.id,
      fiscal_document_type: "INV",
      trnx_id: companyInvoiceTrnxId(invoice.id),
      related_registration_id: null,
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
    if (raced) return presentState(assessment, raced, invoice.invoiceNumber);
    throw new FiscalError("FISCAL_NOT_ELIGIBLE", "The fiscal registration could not be queued.");
  }
  const created = await findRegistration(db, input.restaurantId, invoice.id);
  return presentState(assessment, created, invoice.invoiceNumber);
}

export async function sendClaimedCompanyInvoice(
  db: Db,
  row: Record<string, unknown>,
  fetchImpl?: FiscalFetch,
): Promise<void> {
  return sendStoredFiscalRequest(db, row, fetchImpl, "invoice");
}

async function loadInvoice(db: Db, restaurantId: string, invoiceId: string) {
  const result = await db
    .from("financial_account_invoices")
    .select("id, issued_number, snapshot")
    .eq("id", invoiceId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const row = fiscalRecord(result.data);
  if (result.error || !row || typeof row.id !== "string") {
    throw new FiscalError("FISCAL_NOT_ELIGIBLE", "That issued company invoice was not found.");
  }
  return {
    id: row.id,
    invoiceNumber: typeof row.issued_number === "string" ? row.issued_number : "",
    snapshot: row.snapshot,
  };
}

async function loadFiscalContext(db: Db, restaurantId: string) {
  const integration = await db
    .from("pms_integrations")
    .select("id, enabled, config")
    .eq("restaurant_id", restaurantId)
    .eq("category", "fiscal")
    .eq("provider", "erp_fiscal")
    .maybeSingle();
  const row = fiscalRecord(integration.data);
  if (!row || typeof row.id !== "string") return emptyContext();
  const config = record(row.config);
  const [taxes, items, credentials] = await Promise.all([
    db.from("fiscal_tax_code_mappings").select("*").eq("integration_id", row.id),
    db.from("fiscal_item_mappings").select("*").eq("integration_id", row.id),
    db
      .from("fiscal_credential_refs")
      .select("integration_id")
      .eq("integration_id", row.id)
      .maybeSingle(),
  ]);
  return {
    integrationId: row.id,
    connection: {
      enabled: row.enabled !== false,
      taxpayerTin: String(config?.taxpayerTin ?? ""),
      client: String(config?.client ?? ""),
      deviceId: String(config?.deviceId ?? ""),
      credentialsConfigured: Boolean(fiscalRecord(credentials.data)),
    },
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
    taxMappings: [] as FiscalTaxMapping[],
    itemMappings: [] as FiscalItemMapping[],
  };
}

async function findRegistration(db: Db, restaurantId: string, invoiceId: string) {
  const result = await db
    .from("fiscal_registrations")
    .select(
      "id, status, trnx_id, external_irn, external_document_number, acknowledged_at, registered_at, signed_qr, last_error_message, request_snapshot",
    )
    .eq("restaurant_id", restaurantId)
    .eq("source_type", "account_invoice")
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
  assessment: CompanyInvoiceFiscalAssessment,
  registration: Awaited<ReturnType<typeof findRegistration>>,
  invoiceNumber: string,
): CompanyInvoiceFiscalState {
  const stored = registration ? companyPreviewFromPayload(registration.request) : null;
  const fresh = assessment.ok ? assessment.preview : null;
  const preview = stored
    ? { ...stored, invoiceNumber: invoiceNumber || stored.invoiceNumber }
    : fresh;
  const base = {
    reasons: assessment.ok ? [] : assessment.reasons,
    missingTaxes: assessment.ok ? [] : assessment.missingTaxes,
    missingItems: assessment.ok ? [] : assessment.missingItems,
    missingDevice: assessment.ok ? false : assessment.missingDevice,
    preview,
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
