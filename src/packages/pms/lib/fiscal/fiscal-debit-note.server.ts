/**
 * Phase 4 guest debit-note DEB registration.
 *
 * Queues one stable registration for an already-issued guest debit note and
 * sends the stored snapshot. It does not post a folio transaction, change the
 * debit note, or change the original invoice or its fiscal registration.
 */
import {
  assessDebitNoteFiscal,
  debitNoteTrnxId,
  type DebitNoteFiscalAssessment,
  type DebitNoteFiscalPreview,
} from "./fiscal-debit-note.ts";
import { fiscalPayloadHash, fiscalQrSrc } from "./fiscal-guest-invoice.ts";
import { sendStoredFiscalRequest } from "./fiscal-guest-invoice.server.ts";
import type { FiscalFetch } from "./fiscal-client.server.ts";
import { FiscalError, fiscalRecord, type FiscalDb } from "./fiscal.types.ts";

type Db = FiscalDb;

export type DebitNoteFiscalState = {
  status: "not_registered" | "not_eligible" | "queued" | "registered" | "failed";
  reasons: string[];
  missingDevice: boolean;
  canRegister: boolean;
  canRetry: boolean;
  preview: DebitNoteFiscalPreview | null;
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

export async function getDebitNoteFiscalState(
  db: Db,
  input: { restaurantId: string; debitNoteId: string },
): Promise<DebitNoteFiscalState> {
  const loaded = await loadDebitContext(db, input.restaurantId, input.debitNoteId);
  const registration = await findDebitRegistration(db, input.restaurantId, input.debitNoteId);
  return presentState(loaded.assessment, registration);
}

export async function queueDebitNoteFiscal(
  db: Db,
  input: { restaurantId: string; debitNoteId: string },
): Promise<DebitNoteFiscalState> {
  const loaded = await loadDebitContext(db, input.restaurantId, input.debitNoteId);
  const existing = await findDebitRegistration(db, input.restaurantId, input.debitNoteId);
  if (!loaded.assessment.ok) return presentState(loaded.assessment, existing);
  if (existing?.status === "REGISTERED" || existing?.status === "PENDING") {
    return presentState(loaded.assessment, existing);
  }
  if (existing?.status === "FAILED" || existing?.status === "BLOCKED") {
    await db
      .from("fiscal_registrations")
      .update({
        status: "PENDING",
        next_attempt_at: new Date(Date.now() - 1000).toISOString(),
        last_error_code: null,
      })
      .eq("id", existing.id);
    const refreshed = await findDebitRegistration(db, input.restaurantId, input.debitNoteId);
    return presentState(loaded.assessment, refreshed);
  }
  const inserted = await db
    .from("fiscal_registrations")
    .insert({
      restaurant_id: input.restaurantId,
      integration_id: loaded.integrationId,
      device_id_snapshot: loaded.connection.deviceId,
      taxpayer_tin_snapshot: loaded.connection.taxpayerTin,
      client_snapshot: loaded.connection.client,
      source_type: "debit_note",
      source_id: input.debitNoteId,
      fiscal_document_type: "DEB",
      trnx_id: debitNoteTrnxId(input.debitNoteId),
      related_registration_id: loaded.originalRegistrationId,
      status: "PENDING",
      request_snapshot: loaded.assessment.payload,
      request_hash: fiscalPayloadHash(loaded.assessment.payload),
      attempt_count: 0,
      next_attempt_at: new Date(Date.now() - 1000).toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (inserted.error) {
    const raced = await findDebitRegistration(db, input.restaurantId, input.debitNoteId);
    if (raced) return presentState(loaded.assessment, raced);
    throw new FiscalError("FISCAL_NOT_ELIGIBLE", "The fiscal registration could not be queued.");
  }
  const created = await findDebitRegistration(db, input.restaurantId, input.debitNoteId);
  return presentState(loaded.assessment, created);
}

export async function sendClaimedDebitNote(
  db: Db,
  row: Record<string, unknown>,
  fetchImpl?: FiscalFetch,
): Promise<void> {
  return sendStoredFiscalRequest(db, row, fetchImpl, "debit note");
}

async function loadDebitContext(db: Db, restaurantId: string, debitNoteId: string) {
  const noteResult = await db
    .from("invoice_credit_notes")
    .select(
      "id, note_type, guest_invoice_id, account_invoice_id, currency, issued_at, note_number, total_delta, snapshot",
    )
    .eq("id", debitNoteId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const note = fiscalRecord(noteResult.data);
  if (noteResult.error || !note || typeof note.id !== "string" || note.note_type !== "debit") {
    throw new FiscalError("FISCAL_NOT_ELIGIBLE", "That issued debit note was not found.");
  }
  const guestInvoiceId = typeof note.guest_invoice_id === "string" ? note.guest_invoice_id : null;
  const invoice = guestInvoiceId
    ? await db
        .from("guest_folio_invoices")
        .select("id, snapshot")
        .eq("id", guestInvoiceId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle()
    : null;
  const invoiceRow = invoice ? fiscalRecord(invoice.data) : null;
  const original = guestInvoiceId
    ? await db
        .from("fiscal_registrations")
        .select("id, status, external_irn, external_document_number, request_snapshot")
        .eq("restaurant_id", restaurantId)
        .eq("source_type", "guest_invoice")
        .eq("source_id", guestInvoiceId)
        .eq("fiscal_document_type", "INV")
        .maybeSingle()
    : null;
  const originalRow = original ? fiscalRecord(original.data) : null;
  const connection = await loadConnection(db, restaurantId);
  const assessment = assessDebitNoteFiscal(debitNoteId, {
    guestInvoiceId,
    currency: typeof note.currency === "string" ? note.currency : "",
    issuedAt: typeof note.issued_at === "string" ? note.issued_at : "",
    noteNumber: typeof note.note_number === "string" ? note.note_number : "",
    totalDelta: Number(note.total_delta ?? 0),
    debitSnapshot: note.snapshot,
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
  if (!row || typeof row.id !== "string") {
    return {
      integrationId: "",
      connection: {
        enabled: false,
        taxpayerTin: "",
        client: "",
        deviceId: "",
        credentialsConfigured: false,
      },
    };
  }
  const config =
    row.config && typeof row.config === "object" && !Array.isArray(row.config)
      ? (row.config as Record<string, unknown>)
      : {};
  const credentials = await db
    .from("fiscal_credential_refs")
    .select("integration_id")
    .eq("integration_id", row.id)
    .maybeSingle();
  return {
    integrationId: row.id,
    connection: {
      enabled: row.enabled !== false,
      taxpayerTin: String(config.taxpayerTin ?? ""),
      client: String(config.client ?? ""),
      deviceId: String(config.deviceId ?? ""),
      credentialsConfigured: Boolean(fiscalRecord(credentials.data)),
    },
  };
}

async function findDebitRegistration(db: Db, restaurantId: string, debitNoteId: string) {
  const result = await db
    .from("fiscal_registrations")
    .select(
      "id, status, trnx_id, external_irn, external_document_number, acknowledged_at, registered_at, signed_qr, last_error_message",
    )
    .eq("restaurant_id", restaurantId)
    .eq("source_type", "debit_note")
    .eq("source_id", debitNoteId)
    .eq("fiscal_document_type", "DEB")
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
  assessment: DebitNoteFiscalAssessment,
  registration: Awaited<ReturnType<typeof findDebitRegistration>>,
): DebitNoteFiscalState {
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
