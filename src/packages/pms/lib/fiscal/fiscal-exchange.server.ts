/**
 * Loads one property's stored fiscal registration and its attempts.
 * The caller must already have authorized an owner or manager.
 * This module does not read credentials or tokens and does not write.
 */
import { FiscalError, fiscalRecord, fiscalRecords, type FiscalDb } from "./fiscal.types.ts";
import {
  buildFiscalRegistrationExchange,
  type FiscalRegistrationExchange,
} from "./fiscal-exchange.ts";

type Db = FiscalDb;

export async function loadFiscalRegistrationExchange(
  db: Db,
  input: { restaurantId: string; registrationId: string },
): Promise<FiscalRegistrationExchange> {
  const registration = await db
    .from("fiscal_registrations")
    .select(
      "id, restaurant_id, source_type, source_id, fiscal_document_type, status, trnx_id, external_status, external_irn, external_document_number, created_at, registered_at, acknowledged_at, attempt_count, next_attempt_at, last_error_code, last_error_message, request_snapshot, response_snapshot",
    )
    .eq("id", input.registrationId)
    .eq("restaurant_id", input.restaurantId)
    .maybeSingle();
  const row = fiscalRecord(registration.data);
  if (registration.error || !row) {
    throw new FiscalError("FISCAL_NOT_ELIGIBLE", "That fiscal registration was not found.");
  }
  const attempts = await db
    .from("fiscal_registration_attempts")
    .select(
      "id, registration_id, attempt_number, started_at, completed_at, created_at, http_status, outcome, error_code, error_message, request_body, response_body",
    )
    .eq("registration_id", input.registrationId);
  const invoiceNumber =
    row.source_type === "guest_invoice" && typeof row.source_id === "string"
      ? await guestInvoiceNumber(db, input.restaurantId, row.source_id)
      : row.source_type === "credit_note" && typeof row.source_id === "string"
        ? await creditNoteNumber(db, input.restaurantId, row.source_id)
        : row.source_type === "debit_note" && typeof row.source_id === "string"
          ? await debitNoteNumber(db, input.restaurantId, row.source_id)
          : row.source_type === "guest_allocation" && typeof row.source_id === "string"
            ? await allocationInvoiceNumber(db, input.restaurantId, row.source_id)
            : null;
  return buildFiscalRegistrationExchange({
    registration: row,
    attempts: fiscalRecords(attempts.data),
    invoiceNumber,
  });
}

async function guestInvoiceNumber(
  db: Db,
  restaurantId: string,
  invoiceId: string,
): Promise<string | null> {
  const result = await db
    .from("guest_folio_invoices")
    .select("issued_number")
    .eq("id", invoiceId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const issued = fiscalRecord(result.data)?.issued_number;
  return typeof issued === "string" && issued.trim().length > 0 ? issued : null;
}

async function allocationInvoiceNumber(
  db: Db,
  restaurantId: string,
  allocationId: string,
): Promise<string | null> {
  const allocation = await db
    .from("guest_payment_invoice_allocations")
    .select("invoice_id")
    .eq("id", allocationId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const invoiceId = fiscalRecord(allocation.data)?.invoice_id;
  return typeof invoiceId === "string" ? guestInvoiceNumber(db, restaurantId, invoiceId) : null;
}

async function debitNoteNumber(
  db: Db,
  restaurantId: string,
  debitNoteId: string,
): Promise<string | null> {
  const result = await db
    .from("invoice_credit_notes")
    .select("note_number")
    .eq("id", debitNoteId)
    .eq("restaurant_id", restaurantId)
    .eq("note_type", "debit")
    .maybeSingle();
  const number = fiscalRecord(result.data)?.note_number;
  return typeof number === "string" && number.trim().length > 0 ? number : null;
}

async function creditNoteNumber(
  db: Db,
  restaurantId: string,
  creditNoteId: string,
): Promise<string | null> {
  const result = await db
    .from("invoice_credit_notes")
    .select("note_number")
    .eq("id", creditNoteId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const number = fiscalRecord(result.data)?.note_number;
  return typeof number === "string" && number.trim().length > 0 ? number : null;
}
