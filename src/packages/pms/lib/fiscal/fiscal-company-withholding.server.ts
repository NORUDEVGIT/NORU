/**
 * Company withholding fiscal registration.
 *
 * Queues one stored request per certificate. Retries resend that snapshot.
 * Registration does not post another ledger row.
 */
import type { FiscalFetch } from "./fiscal-client.server.ts";
import { fiscalPayloadHash, fiscalQrSrc } from "./fiscal-guest-invoice.ts";
import { sendStoredFiscalRequest } from "./fiscal-guest-invoice.server.ts";
import {
  assessCompanyWithholdingFiscal,
  companyWithholdingTrnxId,
  originalFiscalPretax,
  parseFiscalWithholdingSuccess,
  withholdingPreviewFromPayload,
  type WithholdingAssessment,
  type WithholdingPreview,
} from "./fiscal-company-withholding.ts";
import { FiscalError, fiscalRecord, fiscalRecords, type FiscalDb } from "./fiscal.types.ts";

type Db = FiscalDb;

export type CompanyWithholdingLine = {
  certificateId: string;
  reference: string | null;
  certificateDate: string;
  pretaxBase: number;
  amount: number;
  reversed: boolean;
  reversal: boolean;
  status: "not_registered" | "not_eligible" | "queued" | "registered" | "failed";
  reasons: string[];
  canRegister: boolean;
  canRetry: boolean;
  preview: WithholdingPreview | null;
  registration: {
    id: string;
    trnxId: string;
    rrn: string | null;
    externalId: string | null;
    qrSrc: string | null;
    lastError: string | null;
  } | null;
};

export type CompanyWithholdingBoard = {
  companyName: string;
  invoiceNumber: string | null;
  invoiceTotal: number;
  effectiveNet: number;
  paymentsAllocated: number;
  withholding: number;
  outstanding: number;
  subtotal: number;
  fiscalPretax: number | null;
  fiscalInvoiceStatus: string;
  fiscalIrn: string | null;
  lines: CompanyWithholdingLine[];
};

type CertificateRow = {
  id: string;
  amount: number;
  pretaxBase: number;
  certificateDate: string;
  reference: string | null;
  reversesId: string | null;
};

export async function getCompanyInvoiceWithholding(
  db: Db,
  input: { restaurantId: string; invoiceId: string },
): Promise<CompanyWithholdingBoard> {
  const loaded = await loadInvoice(db, input.restaurantId, input.invoiceId);
  return presentBoard(loaded);
}

export async function queueCompanyWithholding(
  db: Db,
  input: { restaurantId: string; certificateId: string },
): Promise<CompanyWithholdingLine> {
  const certificate = await loadCertificate(db, input.restaurantId, input.certificateId);
  const loaded = await loadInvoice(db, input.restaurantId, certificate.invoiceId);
  const row = loaded.certificates.find((item) => item.id === certificate.id) ?? null;
  if (!row) {
    throw new FiscalError("FISCAL_NOT_ELIGIBLE", "That withholding certificate was not found.");
  }
  const existing = findRegistration(loaded.registrations, row.id);
  const assessment = assess(loaded, row);
  if (existing?.status === "REGISTERED" || existing?.status === "PENDING") {
    return present(loaded, row, existing);
  }
  if (!assessment.ok) return present(loaded, row, existing);
  if (existing?.status === "FAILED" || existing?.status === "BLOCKED") {
    await db
      .from("fiscal_registrations")
      .update({
        status: "PENDING",
        next_attempt_at: new Date(Date.now() - 1000).toISOString(),
        last_error_code: null,
      })
      .eq("id", existing.id);
    const refreshed = await loadInvoice(db, input.restaurantId, certificate.invoiceId);
    const current = refreshed.certificates.find((item) => item.id === row.id) ?? row;
    return present(refreshed, current, findRegistration(refreshed.registrations, row.id));
  }
  const inserted = await db
    .from("fiscal_registrations")
    .insert({
      restaurant_id: input.restaurantId,
      integration_id: loaded.integrationId,
      device_id_snapshot: loaded.connection.deviceId,
      taxpayer_tin_snapshot: loaded.connection.taxpayerTin,
      client_snapshot: loaded.connection.client,
      source_type: "withholding",
      source_id: row.id,
      fiscal_document_type: "WITHHOLDING",
      trnx_id: companyWithholdingTrnxId(row.id),
      related_registration_id: loaded.originalRegistrationId,
      status: "PENDING",
      request_snapshot: assessment.payload,
      request_hash: fiscalPayloadHash(assessment.payload),
      attempt_count: 0,
      next_attempt_at: new Date(Date.now() - 1000).toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (inserted.error) {
    const raced = await loadInvoice(db, input.restaurantId, certificate.invoiceId);
    const found = findRegistration(raced.registrations, row.id);
    const current = raced.certificates.find((item) => item.id === row.id) ?? row;
    if (found) return present(raced, current, found);
    throw new FiscalError("FISCAL_NOT_ELIGIBLE", "The fiscal registration could not be queued.");
  }
  const created = await loadInvoice(db, input.restaurantId, certificate.invoiceId);
  const current = created.certificates.find((item) => item.id === row.id) ?? row;
  return present(created, current, findRegistration(created.registrations, row.id));
}

export async function sendClaimedWithholding(
  db: Db,
  row: Record<string, unknown>,
  fetchImpl?: FiscalFetch,
): Promise<void> {
  const active = await certificateStillActive(
    db,
    String(row.restaurant_id ?? ""),
    String(row.source_id ?? ""),
  );
  if (!active) {
    await blockClaimed(
      db,
      row,
      "This withholding certificate was reversed and cannot be fiscalized.",
    );
    return;
  }
  return sendStoredFiscalRequest(
    db,
    row,
    fetchImpl,
    "withholding",
    "withholding",
    parseFiscalWithholdingSuccess,
  );
}

async function certificateStillActive(db: Db, restaurantId: string, certificateId: string) {
  const result = await db
    .from("withholding_certificates")
    .select("id, amount, reverses_certificate_id, invoice_id")
    .eq("id", certificateId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const row = fiscalRecord(result.data);
  if (!row || row.reverses_certificate_id || Number(row.amount) <= 0) return false;
  if (typeof row.invoice_id !== "string") return false;
  const siblings = await db
    .from("withholding_certificates")
    .select("reverses_certificate_id")
    .eq("restaurant_id", restaurantId)
    .eq("invoice_id", row.invoice_id);
  return !fiscalRecords((await siblings).data).some(
    (item) => item.reverses_certificate_id === certificateId,
  );
}

async function blockClaimed(db: Db, row: Record<string, unknown>, message: string) {
  const attemptNumber = Number(row.attempt_count ?? 0) + 1;
  const now = new Date().toISOString();
  await db.from("fiscal_registration_attempts").insert({
    registration_id: row.id,
    attempt_number: attemptNumber,
    endpoint: "withholding",
    request_hash: row.request_hash ?? null,
    request_body: row.request_snapshot ?? { note: message },
    http_status: null,
    response_body: null,
    outcome: "fatal_error",
    error_code: "FISCAL_NOT_ELIGIBLE",
    error_message: message,
    started_at: now,
    completed_at: now,
    latency_ms: 0,
  });
  await db
    .from("fiscal_registrations")
    .update({
      status: "FAILED",
      attempt_count: attemptNumber,
      next_attempt_at: null,
      last_error_code: "FISCAL_NOT_ELIGIBLE",
      last_error_message: message,
    })
    .eq("id", row.id);
}

type StoredRegistration = {
  id: string;
  sourceId: string;
  status: string;
  trnxId: string;
  rrn: string | null;
  externalId: string | null;
  signedQr: string | null;
  lastError: string | null;
  request: unknown;
};

type InvoiceContext = {
  invoiceNumber: string | null;
  companyName: string;
  accountKind: string;
  currency: string;
  invoiceTotal: number;
  noteDelta: number;
  allocated: number;
  subtotal: number;
  hasAdjustingNotes: boolean;
  certificates: CertificateRow[];
  registrations: StoredRegistration[];
  original: { status: string; irn: string | null; requestSnapshot: unknown } | null;
  originalRegistrationId: string | null;
  integrationId: string;
  connection: WithholdingFiscalConnection;
};

type WithholdingFiscalConnection = {
  enabled: boolean;
  taxpayerTin: string;
  client: string;
  deviceId: string;
  credentialsConfigured: boolean;
};

async function loadCertificate(db: Db, restaurantId: string, certificateId: string) {
  const result = await db
    .from("withholding_certificates")
    .select("id, invoice_id")
    .eq("id", certificateId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const row = fiscalRecord(result.data);
  if (result.error || !row || typeof row.invoice_id !== "string" || typeof row.id !== "string") {
    throw new FiscalError("FISCAL_NOT_ELIGIBLE", "That withholding certificate was not found.");
  }
  return { id: row.id, invoiceId: row.invoice_id };
}

async function loadInvoice(
  db: Db,
  restaurantId: string,
  invoiceId: string,
): Promise<InvoiceContext> {
  const invoiceResult = await db
    .from("financial_account_invoices")
    .select("id, issued_number, snapshot")
    .eq("id", invoiceId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const invoice = fiscalRecord(invoiceResult.data);
  const snapshot = record(invoice?.snapshot);
  const totals = record(snapshot?.totals);
  const account = record(snapshot?.account);
  const billTo = record(snapshot?.billTo);
  const notes = await db
    .from("invoice_credit_notes")
    .select("id, note_type, total_delta")
    .eq("restaurant_id", restaurantId)
    .eq("account_invoice_id", invoiceId);
  const noteRows = fiscalRecords((await notes).data);
  const allocations = await db
    .from("financial_account_payment_allocations")
    .select("amount")
    .eq("restaurant_id", restaurantId)
    .eq("invoice_id", invoiceId);
  const certificates = await certificateRows(db, restaurantId, invoiceId);
  const originalResult = invoice
    ? await db
        .from("fiscal_registrations")
        .select("id, status, external_irn, request_snapshot")
        .eq("restaurant_id", restaurantId)
        .eq("source_type", "account_invoice")
        .eq("source_id", invoiceId)
        .eq("fiscal_document_type", "INV")
        .maybeSingle()
    : null;
  const originalRow = originalResult ? fiscalRecord(originalResult.data) : null;
  const registrationResult = await db
    .from("fiscal_registrations")
    .select(
      "id, source_id, status, trnx_id, external_rrn, external_id, signed_qr, last_error_message, request_snapshot",
    )
    .eq("restaurant_id", restaurantId)
    .eq("source_type", "withholding")
    .eq("fiscal_document_type", "WITHHOLDING");
  const connection = await loadConnection(db, restaurantId);
  return {
    invoiceNumber: text(invoice?.issued_number),
    companyName: text(billTo?.name) ?? "",
    accountKind: typeof account?.accountKind === "string" ? account.accountKind : "",
    currency: text(account?.currency) ?? "",
    invoiceTotal: numberValue(totals?.invoiceTotal ?? totals?.balance),
    noteDelta: noteRows.reduce((sum, row) => sum + numberValue(row.total_delta), 0),
    allocated: fiscalRecords((await allocations).data).reduce(
      (sum, row) => sum + numberValue(row.amount),
      0,
    ),
    subtotal: numberValue(totals?.subtotal),
    hasAdjustingNotes: noteRows.some(
      (row) => row.note_type === "credit" || row.note_type === "debit",
    ),
    certificates,
    registrations: fiscalRecords((await registrationResult).data)
      .filter((row) => row.status !== "CANCELLED")
      .map(mapRegistration)
      .filter((row): row is StoredRegistration => row != null),
    original: originalRow
      ? {
          status: typeof originalRow.status === "string" ? originalRow.status : "",
          irn: text(originalRow.external_irn),
          requestSnapshot: originalRow.request_snapshot ?? null,
        }
      : null,
    originalRegistrationId: text(originalRow?.id),
    integrationId: connection.integrationId,
    connection: connection.connection,
  };
}

function presentBoard(context: InvoiceContext): CompanyWithholdingBoard {
  const active = context.certificates
    .filter((row) => !row.reversesId && !isReversed(row, context.certificates))
    .reduce((sum, row) => sum + row.amount, 0);
  const effective = roundMoney(context.invoiceTotal + context.noteDelta);
  const allocated = roundMoney(context.allocated);
  const withholding = roundMoney(active);
  return {
    companyName: context.companyName,
    invoiceNumber: context.invoiceNumber,
    invoiceTotal: roundMoney(context.invoiceTotal),
    effectiveNet: effective,
    paymentsAllocated: allocated,
    withholding,
    outstanding: roundMoney(effective - allocated - withholding),
    subtotal: roundMoney(context.subtotal),
    fiscalPretax: originalFiscalPretax(context.original?.requestSnapshot),
    fiscalInvoiceStatus: context.original?.status || "NOT_REGISTERED",
    fiscalIrn: context.original?.irn ?? null,
    lines: context.certificates.map((row) =>
      present(context, row, findRegistration(context.registrations, row.id)),
    ),
  };
}

function assess(context: InvoiceContext, certificate: CertificateRow): WithholdingAssessment {
  return assessCompanyWithholdingFiscal(certificate.id, {
    amount: certificate.amount,
    pretaxBase: certificate.pretaxBase,
    certificateDate: certificate.certificateDate,
    reversed: isReversed(certificate, context.certificates),
    reversalRow: Boolean(certificate.reversesId),
    accountKind: context.accountKind,
    currency: context.currency,
    invoiceNumber: context.invoiceNumber,
    hasAdjustingNotes: context.hasAdjustingNotes,
    connection: context.connection,
    originalRegistration: context.original,
  });
}

function present(
  context: InvoiceContext,
  certificate: CertificateRow,
  registration: StoredRegistration | null,
): CompanyWithholdingLine {
  const assessment = assess(context, certificate);
  const stored = registration ? withholdingPreviewFromPayload(registration.request) : null;
  const fresh = assessment.ok ? assessment.preview : assessment.projection;
  const preview = stored ? { ...stored, invoiceNumber: context.invoiceNumber } : fresh;
  const view = registration
    ? {
        id: registration.id,
        trnxId: registration.trnxId,
        rrn: registration.rrn,
        externalId: registration.externalId,
        qrSrc: fiscalQrSrc(registration.signedQr),
        lastError: registration.lastError,
      }
    : null;
  const base = {
    certificateId: certificate.id,
    reference: certificate.reference,
    certificateDate: certificate.certificateDate,
    pretaxBase: certificate.pretaxBase,
    amount: certificate.amount,
    reversed: isReversed(certificate, context.certificates),
    reversal: Boolean(certificate.reversesId),
    preview,
    registration: view,
  };
  if (registration?.status === "REGISTERED") {
    return { ...base, status: "registered", reasons: [], canRegister: false, canRetry: false };
  }
  if (registration?.status === "PENDING" && assessment.ok) {
    return { ...base, status: "queued", reasons: [], canRegister: false, canRetry: false };
  }
  if (!assessment.ok) {
    return {
      ...base,
      status: "not_eligible",
      reasons: assessment.reasons,
      canRegister: false,
      canRetry: false,
    };
  }
  if (!registration) {
    return { ...base, status: "not_registered", reasons: [], canRegister: true, canRetry: false };
  }
  return { ...base, status: "failed", reasons: [], canRegister: false, canRetry: true };
}

async function certificateRows(db: Db, restaurantId: string, invoiceId: string) {
  const result = await db
    .from("withholding_certificates")
    .select(
      "id, amount, pretax_base, certificate_date, reference, reverses_certificate_id, created_at",
    )
    .eq("restaurant_id", restaurantId)
    .eq("invoice_id", invoiceId);
  return fiscalRecords((await result).data)
    .map(mapCertificate)
    .filter((row): row is CertificateRow => row != null)
    .sort((left, right) => (left.certificateDate < right.certificateDate ? -1 : 1));
}

function mapCertificate(row: Record<string, unknown>): CertificateRow | null {
  if (typeof row.id !== "string") return null;
  const date = text(row.certificate_date)?.slice(0, 10) ?? "";
  return {
    id: row.id,
    amount: numberValue(row.amount),
    pretaxBase: numberValue(row.pretax_base),
    certificateDate: date,
    reference: text(row.reference),
    reversesId: text(row.reverses_certificate_id),
  };
}

function mapRegistration(row: Record<string, unknown>): StoredRegistration | null {
  if (typeof row.id !== "string" || typeof row.source_id !== "string") return null;
  return {
    id: row.id,
    sourceId: row.source_id,
    status: typeof row.status === "string" ? row.status : "",
    trnxId: text(row.trnx_id) ?? "",
    rrn: text(row.external_rrn),
    externalId: text(row.external_id),
    signedQr: text(row.signed_qr),
    lastError: text(row.last_error_message),
    request: row.request_snapshot ?? null,
  };
}

function findRegistration(rows: StoredRegistration[], certificateId: string) {
  return rows.find((row) => row.sourceId === certificateId) ?? null;
}

function isReversed(row: CertificateRow, rows: CertificateRow[]) {
  return rows.some((other) => other.reversesId === row.id);
}

async function loadConnection(db: Db, restaurantId: string) {
  const integration = await db
    .from("pms_integrations")
    .select("id, enabled, config")
    .eq("restaurant_id", restaurantId)
    .eq("category", "fiscal")
    .eq("provider", "erp_fiscal")
    .maybeSingle();
  const row = fiscalRecord(integration.data);
  const config = record(row?.config) ?? {};
  const credentials =
    row && typeof row.id === "string"
      ? await db
          .from("fiscal_credential_refs")
          .select("integration_id")
          .eq("integration_id", row.id)
          .maybeSingle()
      : null;
  return {
    integrationId: typeof row?.id === "string" ? row.id : "",
    connection: {
      enabled: row?.enabled !== false && Boolean(row),
      taxpayerTin: String(config.taxpayerTin ?? ""),
      client: String(config.client ?? ""),
      deviceId: String(config.deviceId ?? ""),
      credentialsConfigured: Boolean(credentials && fiscalRecord(credentials.data)),
    },
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
