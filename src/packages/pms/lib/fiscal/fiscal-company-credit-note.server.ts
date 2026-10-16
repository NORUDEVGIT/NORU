/**
 * Queues a company B2B credit note. The stored request is sent by the existing
 * credit-note outbox path. This module does not change the note or the ledger.
 */
import { fiscalPayloadHash, fiscalQrSrc } from "./fiscal-guest-invoice.ts";
import { sendStoredFiscalRequest } from "./fiscal-guest-invoice.server.ts";
import type { FiscalFetch } from "./fiscal-client.server.ts";
import {
  assessCompanyCreditFiscal,
  companyCreditTrnxId,
  type CompanyCreditAssessment,
  type CompanyCreditPreview,
} from "./fiscal-company-credit-note.ts";
import { FiscalError, fiscalRecord, type FiscalDb } from "./fiscal.types.ts";

type Db = FiscalDb;

export type CompanyCreditFiscalState = {
  status: "not_registered" | "not_eligible" | "queued" | "registered" | "failed";
  reasons: string[];
  missingDevice: boolean;
  canRegister: boolean;
  canRetry: boolean;
  preview: CompanyCreditPreview | null;
  registration: {
    id: string;
    trnxId: string;
    documentNumber: string | null;
    irn: string | null;
    lastError: string | null;
    qrSrc: string | null;
    qrStored: boolean;
  } | null;
};

export async function getCompanyCreditFiscalState(
  db: Db,
  input: { restaurantId: string; creditNoteId: string },
): Promise<CompanyCreditFiscalState> {
  const loaded = await loadCredit(db, input.restaurantId, input.creditNoteId);
  const registration = await findRegistration(db, input.restaurantId, input.creditNoteId);
  return present(loaded.assessment, registration);
}

export async function queueCompanyCreditFiscal(
  db: Db,
  input: { restaurantId: string; creditNoteId: string },
): Promise<CompanyCreditFiscalState> {
  const loaded = await loadCredit(db, input.restaurantId, input.creditNoteId);
  const assessment = loaded.assessment;
  const existing = await findRegistration(db, input.restaurantId, input.creditNoteId);
  if (existing?.status === "REGISTERED" || existing?.status === "PENDING") {
    return present(assessment, existing);
  }
  if (!assessment.ok) return present(assessment, existing);
  if (existing?.status === "FAILED" || existing?.status === "BLOCKED") {
    await db
      .from("fiscal_registrations")
      .update({
        status: "PENDING",
        next_attempt_at: new Date(Date.now() - 1000).toISOString(),
        last_error_code: null,
      })
      .eq("id", existing.id);
    return present(assessment, await findRegistration(db, input.restaurantId, input.creditNoteId));
  }
  const inserted = await db
    .from("fiscal_registrations")
    .insert({
      restaurant_id: input.restaurantId,
      integration_id: loaded.integrationId,
      device_id_snapshot: loaded.connection.deviceId,
      taxpayer_tin_snapshot: loaded.connection.taxpayerTin,
      client_snapshot: loaded.connection.client,
      source_type: "credit_note",
      source_id: input.creditNoteId,
      fiscal_document_type: "CRE",
      trnx_id: companyCreditTrnxId(input.creditNoteId),
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
    const raced = await findRegistration(db, input.restaurantId, input.creditNoteId);
    if (raced) return present(assessment, raced);
    throw new FiscalError("FISCAL_NOT_ELIGIBLE", "The fiscal registration could not be queued.");
  }
  return present(assessment, await findRegistration(db, input.restaurantId, input.creditNoteId));
}

export async function sendClaimedCompanyCredit(
  db: Db,
  row: Record<string, unknown>,
  fetchImpl?: FiscalFetch,
): Promise<void> {
  return sendStoredFiscalRequest(db, row, fetchImpl, "credit note");
}

async function loadCredit(db: Db, restaurantId: string, creditNoteId: string) {
  const noteResult = await db
    .from("invoice_credit_notes")
    .select(
      "id, note_type, guest_invoice_id, account_invoice_id, currency, issued_at, note_number, total_delta, snapshot",
    )
    .eq("id", creditNoteId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const note = fiscalRecord(noteResult.data);
  if (noteResult.error || !note || note.note_type === "debit") {
    throw new FiscalError("FISCAL_NOT_ELIGIBLE", "That issued credit note was not found.");
  }
  const accountInvoiceId =
    typeof note.account_invoice_id === "string" ? note.account_invoice_id : null;
  const invoice = accountInvoiceId
    ? await db
        .from("financial_account_invoices")
        .select("id, snapshot")
        .eq("id", accountInvoiceId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle()
    : null;
  const invoiceRow = invoice ? fiscalRecord(invoice.data) : null;
  const account = record(record(invoiceRow?.snapshot)?.account);
  const original = accountInvoiceId
    ? await db
        .from("fiscal_registrations")
        .select("id, status, external_irn, external_document_number, request_snapshot")
        .eq("restaurant_id", restaurantId)
        .eq("source_type", "account_invoice")
        .eq("source_id", accountInvoiceId)
        .eq("fiscal_document_type", "INV")
        .maybeSingle()
    : null;
  const originalRow = original ? fiscalRecord(original.data) : null;
  const connection = await loadConnection(db, restaurantId);
  const assessment = assessCompanyCreditFiscal(creditNoteId, {
    accountInvoiceId,
    accountKind: typeof account?.accountKind === "string" ? account.accountKind : "",
    currency: typeof note.currency === "string" ? note.currency : "",
    issuedAt: typeof note.issued_at === "string" ? note.issued_at : "",
    noteNumber: typeof note.note_number === "string" ? note.note_number : "",
    totalDelta: Number(note.total_delta ?? 0),
    creditSnapshot: note.snapshot,
    invoiceSnapshot: invoiceRow?.snapshot ?? null,
    connection: connection.connection,
    originalRegistration: originalRow
      ? {
          status: typeof originalRow.status === "string" ? originalRow.status : "",
          irn: typeof originalRow.external_irn === "string" ? originalRow.external_irn : null,
          documentNumber:
            typeof originalRow.external_document_number === "string"
              ? originalRow.external_document_number
              : null,
          requestSnapshot: originalRow.request_snapshot ?? null,
        }
      : null,
  });
  return {
    assessment,
    integrationId: connection.integrationId,
    connection: connection.connection,
    originalRegistrationId: typeof originalRow?.id === "string" ? originalRow.id : null,
  };
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

async function findRegistration(db: Db, restaurantId: string, creditNoteId: string) {
  const result = await db
    .from("fiscal_registrations")
    .select(
      "id, status, trnx_id, external_irn, external_document_number, signed_qr, last_error_message",
    )
    .eq("restaurant_id", restaurantId)
    .eq("source_type", "credit_note")
    .eq("source_id", creditNoteId)
    .eq("fiscal_document_type", "CRE")
    .maybeSingle();
  const row = fiscalRecord(result.data);
  if (!row || row.status === "CANCELLED") return null;
  return {
    id: String(row.id ?? ""),
    status: String(row.status ?? ""),
    trnxId: String(row.trnx_id ?? ""),
    documentNumber: text(row.external_document_number),
    irn: text(row.external_irn),
    signedQr: text(row.signed_qr),
    lastError: text(row.last_error_message),
  };
}

function present(
  assessment: CompanyCreditAssessment,
  registration: Awaited<ReturnType<typeof findRegistration>>,
): CompanyCreditFiscalState {
  const base = {
    reasons: assessment.ok ? [] : assessment.reasons,
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

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
