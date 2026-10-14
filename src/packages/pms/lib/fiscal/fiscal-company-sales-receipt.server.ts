/**
 * Company B2B sales-receipt registration.
 *
 * One allocation becomes one stored receipt. Later allocations do not rewrite
 * an earlier request. This module does not post a payment or change an allocation.
 */
import type { FiscalFetch } from "./fiscal-client.server.ts";
import {
  assessCompanyReceiptFiscal,
  companyReceiptPreviewFromPayload,
  companyReceiptTrnxId,
  COMPANY_RECEIPT_REVERSAL_WARNING,
  type CompanyReceiptAssessment,
  type CompanyReceiptPreview,
} from "./fiscal-company-sales-receipt.ts";
import { fiscalPayloadHash } from "./fiscal-guest-invoice.ts";
import { sendStoredFiscalRequest } from "./fiscal-guest-invoice.server.ts";
import { FiscalError, fiscalRecord, fiscalRecords, type FiscalDb } from "./fiscal.types.ts";

type Db = FiscalDb;

export type CompanyReceiptLine = {
  allocationId: string;
  amount: number;
  status: "not_registered" | "not_eligible" | "queued" | "registered" | "failed";
  reasons: string[];
  warning: string | null;
  canRegister: boolean;
  canRetry: boolean;
  preview: CompanyReceiptPreview | null;
  registration: {
    id: string;
    trnxId: string;
    documentNumber: string | null;
    irn: string | null;
    lastError: string | null;
  } | null;
};

type AllocationRow = {
  id: string;
  invoiceId: string;
  paymentId: string;
  amount: number;
  createdAt: string;
  reversesId: string | null;
};

export async function getCompanyInvoiceSalesReceipts(
  db: Db,
  input: { restaurantId: string; invoiceId: string },
): Promise<{ lines: CompanyReceiptLine[] }> {
  const loaded = await loadInvoice(db, input.restaurantId, input.invoiceId);
  return {
    lines: loaded.allocations
      .filter((row) => row.amount > 0 && !row.reversesId)
      .sort(compareAllocations)
      .map((row) => present(loaded, row, findRegistration(loaded.registrations, row.id))),
  };
}

export async function queueCompanyAllocationSalesReceipt(
  db: Db,
  input: { restaurantId: string; allocationId: string },
): Promise<CompanyReceiptLine> {
  const allocation = await loadAllocation(db, input.restaurantId, input.allocationId);
  const loaded = await loadInvoice(db, input.restaurantId, allocation.invoiceId);
  const existing = findRegistration(loaded.registrations, allocation.id);
  const assessment = assess(loaded, allocation);
  if (existing?.status === "REGISTERED" || existing?.status === "PENDING") {
    return present(loaded, allocation, existing);
  }
  if (!assessment.ok) return present(loaded, allocation, existing);
  if (existing?.status === "FAILED" || existing?.status === "BLOCKED") {
    await db
      .from("fiscal_registrations")
      .update({
        status: "PENDING",
        next_attempt_at: new Date(Date.now() - 1000).toISOString(),
        last_error_code: null,
      })
      .eq("id", existing.id);
    const refreshed = await loadInvoice(db, input.restaurantId, allocation.invoiceId);
    return present(refreshed, allocation, findRegistration(refreshed.registrations, allocation.id));
  }
  const inserted = await db
    .from("fiscal_registrations")
    .insert({
      restaurant_id: input.restaurantId,
      integration_id: loaded.integrationId,
      device_id_snapshot: loaded.connection.deviceId,
      taxpayer_tin_snapshot: loaded.connection.taxpayerTin,
      client_snapshot: loaded.connection.client,
      source_type: "account_allocation",
      source_id: allocation.id,
      fiscal_document_type: "SALES_RECEIPT",
      trnx_id: companyReceiptTrnxId(allocation.id),
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
    const raced = await loadInvoice(db, input.restaurantId, allocation.invoiceId);
    const found = findRegistration(raced.registrations, allocation.id);
    if (found) return present(raced, allocation, found);
    throw new FiscalError("FISCAL_NOT_ELIGIBLE", "The fiscal registration could not be queued.");
  }
  const created = await loadInvoice(db, input.restaurantId, allocation.invoiceId);
  return present(created, allocation, findRegistration(created.registrations, allocation.id));
}

export async function sendClaimedCompanyReceipt(
  db: Db,
  row: Record<string, unknown>,
  fetchImpl?: FiscalFetch,
): Promise<void> {
  const active = await allocationStillActive(
    db,
    String(row.restaurant_id ?? ""),
    String(row.source_id ?? ""),
  );
  if (!active) {
    await blockClaimed(
      db,
      row,
      "This allocation was reversed and is not eligible for a fiscal sales receipt.",
    );
    return;
  }
  return sendStoredFiscalRequest(db, row, fetchImpl, "sales receipt", "sales_receipt");
}

async function allocationStillActive(db: Db, restaurantId: string, allocationId: string) {
  const result = await db
    .from("financial_account_payment_allocations")
    .select("id, invoice_id, amount, reverses_allocation_id")
    .eq("id", allocationId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const row = mapAllocation(fiscalRecord(result.data));
  if (!row || row.amount <= 0 || row.reversesId) return false;
  const siblings = await allocationRows(db, restaurantId, row.invoiceId);
  return !isReversed(row, siblings);
}

async function blockClaimed(db: Db, row: Record<string, unknown>, message: string) {
  const attemptNumber = Number(row.attempt_count ?? 0) + 1;
  const now = new Date().toISOString();
  await db.from("fiscal_registration_attempts").insert({
    registration_id: row.id,
    attempt_number: attemptNumber,
    endpoint: "sales_receipt",
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
  documentNumber: string | null;
  irn: string | null;
  lastError: string | null;
  request: unknown;
};

type OriginalInvoiceRegistration = {
  status: string;
  irn: string | null;
  documentNumber: string | null;
  requestSnapshot: unknown;
};

type InvoiceContext = {
  invoiceId: string | null;
  invoiceNumber: string | null;
  accountKind: string;
  currency: string;
  timezone: string;
  hasAdjustingNotes: boolean;
  hasActiveWithholding: boolean;
  paymentKinds: Map<string, "payment" | "deposit" | "other">;
  allocations: AllocationRow[];
  registrations: StoredRegistration[];
  original: OriginalInvoiceRegistration | null;
  originalRegistrationId: string | null;
  integrationId: string;
  connection: {
    enabled: boolean;
    taxpayerTin: string;
    client: string;
    deviceId: string;
    credentialsConfigured: boolean;
  };
};

async function loadAllocation(db: Db, restaurantId: string, allocationId: string) {
  const result = await db
    .from("financial_account_payment_allocations")
    .select("id, invoice_id, payment_transaction_id, amount, created_at, reverses_allocation_id")
    .eq("id", allocationId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const allocation = mapAllocation(fiscalRecord(result.data));
  if (result.error || !allocation) {
    throw new FiscalError("FISCAL_NOT_ELIGIBLE", "That payment allocation was not found.");
  }
  return allocation;
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
  const allocations = await allocationRows(db, restaurantId, invoiceId);
  const notes = await db
    .from("invoice_credit_notes")
    .select("id, note_type")
    .eq("restaurant_id", restaurantId)
    .eq("account_invoice_id", invoiceId);
  const noteRows = fiscalRecords((await notes).data).filter(
    (row) => row.note_type === "credit" || row.note_type === "debit",
  );
  const withholdingResult = await db
    .from("withholding_certificates")
    .select("id, amount, reverses_certificate_id")
    .eq("restaurant_id", restaurantId)
    .eq("invoice_id", invoiceId);
  const withholdingRows = fiscalRecords((await withholdingResult).data);
  const reversedCertificates = new Set(
    withholdingRows
      .map((row) => row.reverses_certificate_id)
      .filter((id): id is string => typeof id === "string"),
  );
  const hasActiveWithholding = withholdingRows.some(
    (row) =>
      row.reverses_certificate_id == null &&
      typeof row.id === "string" &&
      !reversedCertificates.has(row.id) &&
      Number(row.amount) > 0,
  );
  const originalResult = invoice
    ? await db
        .from("fiscal_registrations")
        .select("id, status, external_irn, external_document_number, request_snapshot")
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
      "id, source_id, status, trnx_id, external_irn, external_document_number, last_error_message, request_snapshot",
    )
    .eq("restaurant_id", restaurantId)
    .eq("source_type", "account_allocation")
    .eq("fiscal_document_type", "SALES_RECEIPT");
  const registrations = fiscalRecords((await registrationResult).data)
    .filter((row) => row.status !== "CANCELLED")
    .map(mapRegistration)
    .filter((row): row is StoredRegistration => row != null);
  const property = await db
    .from("restaurants")
    .select("timezone")
    .eq("id", restaurantId)
    .maybeSingle();
  const connection = await loadConnection(db, restaurantId);
  const paymentKinds = new Map<string, "payment" | "deposit" | "other">();
  for (const allocation of allocations) {
    if (paymentKinds.has(allocation.paymentId)) continue;
    paymentKinds.set(
      allocation.paymentId,
      await paymentKind(db, restaurantId, allocation.paymentId),
    );
  }
  const snapshot = invoice?.snapshot;
  const account = record(record(snapshot)?.account);
  return {
    invoiceId: invoice ? invoiceId : null,
    invoiceNumber: text(invoice?.issued_number),
    accountKind: typeof account?.accountKind === "string" ? account.accountKind : "",
    currency:
      text(account?.currency) ?? text(record(record(snapshot)?.property)?.currencyCode) ?? "",
    timezone: text(fiscalRecord(property.data)?.timezone) ?? "UTC",
    hasAdjustingNotes: noteRows.length > 0,
    hasActiveWithholding,
    paymentKinds,
    allocations,
    registrations,
    original: originalRow
      ? {
          status: typeof originalRow.status === "string" ? originalRow.status : "",
          irn: text(originalRow.external_irn),
          documentNumber: text(originalRow.external_document_number),
          requestSnapshot: originalRow.request_snapshot ?? null,
        }
      : null,
    originalRegistrationId: text(originalRow?.id),
    integrationId: connection.integrationId,
    connection: connection.connection,
  };
}

function assess(context: InvoiceContext, allocation: AllocationRow): CompanyReceiptAssessment {
  const earlier = context.allocations
    .filter((row) => row.amount > 0 && !row.reversesId && !isReversed(row, context.allocations))
    .sort(compareAllocations)
    .filter((row) => compareAllocations(row, allocation) < 0);
  return assessCompanyReceiptFiscal(allocation.id, {
    amount: allocation.amount,
    createdAt: allocation.createdAt,
    reversed: isReversed(allocation, context.allocations),
    reversalRow: allocation.amount < 0 || Boolean(allocation.reversesId),
    paymentKind: context.paymentKinds.get(allocation.paymentId) ?? "other",
    accountKind: context.accountKind,
    currency: context.currency,
    invoiceNumber: context.invoiceNumber,
    timezone: context.timezone,
    hasAdjustingNotes: context.hasAdjustingNotes,
    hasActiveWithholding: context.hasActiveWithholding,
    priors: earlier.map((row) => ({
      amount: row.amount,
      fiscalRegistered: findRegistration(context.registrations, row.id)?.status === "REGISTERED",
    })),
    connection: context.connection,
    originalRegistration: context.original,
  });
}

function present(
  context: InvoiceContext,
  allocation: AllocationRow,
  registration: StoredRegistration | null,
): CompanyReceiptLine {
  const assessment = assess(context, allocation);
  const reversed = isReversed(allocation, context.allocations);
  const stored = registration ? companyReceiptPreviewFromPayload(registration.request) : null;
  const fresh = assessment.ok ? assessment.preview : assessment.projection;
  const preview = stored ? { ...stored, invoiceNumber: context.invoiceNumber } : fresh;
  const warning = reversed && registration ? COMPANY_RECEIPT_REVERSAL_WARNING : null;
  const view = registration
    ? {
        id: registration.id,
        trnxId: registration.trnxId,
        documentNumber: registration.documentNumber,
        irn: registration.irn,
        lastError: registration.lastError,
      }
    : null;
  if (registration?.status === "REGISTERED") {
    return line(allocation, "registered", [], warning, false, false, preview, view);
  }
  if (registration?.status === "PENDING") {
    return line(allocation, "queued", [], warning, false, false, preview, view);
  }
  if (!assessment.ok) {
    return line(
      allocation,
      "not_eligible",
      assessment.reasons,
      warning,
      false,
      false,
      preview,
      view,
    );
  }
  if (!registration)
    return line(allocation, "not_registered", [], null, true, false, preview, null);
  return line(allocation, "failed", [], warning, false, true, preview, view);
}

function line(
  allocation: AllocationRow,
  status: CompanyReceiptLine["status"],
  reasons: string[],
  warning: string | null,
  canRegister: boolean,
  canRetry: boolean,
  preview: CompanyReceiptPreview | null,
  registration: CompanyReceiptLine["registration"],
): CompanyReceiptLine {
  return {
    allocationId: allocation.id,
    amount: allocation.amount,
    status,
    reasons,
    warning,
    canRegister,
    canRetry,
    preview,
    registration,
  };
}

async function allocationRows(db: Db, restaurantId: string, invoiceId: string) {
  const result = await db
    .from("financial_account_payment_allocations")
    .select("id, invoice_id, payment_transaction_id, amount, created_at, reverses_allocation_id")
    .eq("restaurant_id", restaurantId)
    .eq("invoice_id", invoiceId);
  return fiscalRecords((await result).data)
    .map((row) => mapAllocation(row))
    .filter((row): row is AllocationRow => row != null);
}

async function paymentKind(db: Db, restaurantId: string, paymentId: string) {
  const result = await db
    .from("folio_transactions")
    .select("id, transaction_type, amount")
    .eq("id", paymentId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const row = fiscalRecord(result.data);
  const type = text(row?.transaction_type);
  if (type === "deposit" || type === "deposit_received") return "deposit" as const;
  if (type === "payment" && numberValue(row?.amount) < 0) return "payment" as const;
  return "other" as const;
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

function mapAllocation(row: Record<string, unknown> | null): AllocationRow | null {
  if (!row || typeof row.id !== "string" || typeof row.invoice_id !== "string") return null;
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    paymentId: typeof row.payment_transaction_id === "string" ? row.payment_transaction_id : "",
    amount: numberValue(row.amount),
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    reversesId: text(row.reverses_allocation_id),
  };
}

function mapRegistration(row: Record<string, unknown>): StoredRegistration | null {
  if (typeof row.id !== "string" || typeof row.source_id !== "string") return null;
  return {
    id: row.id,
    sourceId: row.source_id,
    status: typeof row.status === "string" ? row.status : "",
    trnxId: typeof row.trnx_id === "string" ? row.trnx_id : "",
    documentNumber: text(row.external_document_number),
    irn: text(row.external_irn),
    lastError: text(row.last_error_message),
    request: row.request_snapshot ?? null,
  };
}

function findRegistration(rows: StoredRegistration[], allocationId: string) {
  return rows.find((row) => row.sourceId === allocationId) ?? null;
}

function isReversed(allocation: AllocationRow, rows: AllocationRow[]) {
  return rows.some((row) => row.reversesId === allocation.id && row.amount < 0);
}

function compareAllocations(left: AllocationRow, right: AllocationRow) {
  const time = left.createdAt.localeCompare(right.createdAt);
  return time === 0 ? left.id.localeCompare(right.id) : time;
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
