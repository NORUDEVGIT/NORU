/**
 * Phase 5 guest sales-receipt registration.
 *
 * One active guest payment allocation becomes one sales receipt. The stored
 * request is not rebuilt on retry. This module does not post a payment, change
 * an allocation, or change the original invoice registration.
 */
import type { FiscalFetch } from "./fiscal-client.server.ts";
import { fiscalPayloadHash, fiscalQrSrc } from "./fiscal-guest-invoice.ts";
import { sendStoredFiscalRequest } from "./fiscal-guest-invoice.server.ts";
import {
  SALES_RECEIPT_REVERSAL_WARNING,
  assessSalesReceiptFiscal,
  salesReceiptPreviewFromPayload,
  salesReceiptTrnxId,
  type SalesReceiptFiscalAssessment,
  type SalesReceiptPreview,
} from "./fiscal-sales-receipt.ts";
import { FiscalError, fiscalRecord, fiscalRecords, type FiscalDb } from "./fiscal.types.ts";

type Db = FiscalDb;

export type SalesReceiptRegistrationView = {
  id: string;
  trnxId: string;
  documentNumber: string | null;
  irn: string | null;
  lastError: string | null;
  qrSrc: string | null;
  qrStored: boolean;
};

export type GuestSalesReceiptLine = {
  allocationId: string;
  allocatedAt: string;
  amount: number;
  reversed: boolean;
  status: "not_registered" | "not_eligible" | "queued" | "registered" | "failed";
  reasons: string[];
  warning: string | null;
  canRegister: boolean;
  canRetry: boolean;
  preview: SalesReceiptPreview | null;
  registration: SalesReceiptRegistrationView | null;
};

type AllocationRow = {
  id: string;
  invoiceId: string;
  paymentId: string;
  amount: number;
  createdAt: string;
  reversesId: string | null;
};

type StoredRegistration = {
  id: string;
  sourceId: string;
  status: string;
  trnxId: string;
  documentNumber: string | null;
  irn: string | null;
  signedQr: string | null;
  lastError: string | null;
  request: unknown;
};

export async function getGuestInvoiceSalesReceipts(
  db: Db,
  input: { restaurantId: string; invoiceId: string },
): Promise<{ lines: GuestSalesReceiptLine[] }> {
  const loaded = await loadInvoiceFiscalContext(db, input.restaurantId, input.invoiceId);
  const positives = loaded.allocations
    .filter((row) => row.amount > 0 && !row.reversesId)
    .sort(byAllocationEvent);
  return {
    lines: positives.map((row) =>
      presentAllocation(loaded, row, findRegistration(loaded.registrations, row.id)),
    ),
  };
}

export async function queueGuestAllocationSalesReceipt(
  db: Db,
  input: { restaurantId: string; allocationId: string },
): Promise<GuestSalesReceiptLine> {
  const loaded = await loadAllocationFiscalContext(db, input.restaurantId, input.allocationId);
  const existing = findRegistration(loaded.registrations, input.allocationId);
  if (existing?.status === "REGISTERED" || existing?.status === "PENDING") {
    return presentAllocation(loaded, loaded.allocation, existing);
  }
  if (!loaded.assessment.ok) return presentAllocation(loaded, loaded.allocation, existing);
  if (existing?.status === "FAILED" || existing?.status === "BLOCKED") {
    await db
      .from("fiscal_registrations")
      .update({
        status: "PENDING",
        next_attempt_at: new Date(Date.now() - 1000).toISOString(),
        last_error_code: null,
      })
      .eq("id", existing.id);
    const refreshed = await loadAllocationFiscalContext(db, input.restaurantId, input.allocationId);
    return presentAllocation(
      refreshed,
      refreshed.allocation,
      findRegistration(refreshed.registrations, input.allocationId),
    );
  }
  const inserted = await db
    .from("fiscal_registrations")
    .insert({
      restaurant_id: input.restaurantId,
      integration_id: loaded.integrationId,
      device_id_snapshot: loaded.connection.deviceId,
      taxpayer_tin_snapshot: loaded.connection.taxpayerTin,
      client_snapshot: loaded.connection.client,
      source_type: "guest_allocation",
      source_id: input.allocationId,
      fiscal_document_type: "SALES_RECEIPT",
      trnx_id: salesReceiptTrnxId(input.allocationId),
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
    const raced = await loadAllocationFiscalContext(db, input.restaurantId, input.allocationId);
    const found = findRegistration(raced.registrations, input.allocationId);
    if (found) return presentAllocation(raced, raced.allocation, found);
    throw new FiscalError("FISCAL_NOT_ELIGIBLE", "The fiscal registration could not be queued.");
  }
  const created = await loadAllocationFiscalContext(db, input.restaurantId, input.allocationId);
  return presentAllocation(
    created,
    created.allocation,
    findRegistration(created.registrations, input.allocationId),
  );
}

export async function sendClaimedSalesReceipt(
  db: Db,
  row: Record<string, unknown>,
  fetchImpl?: FiscalFetch,
): Promise<void> {
  const allocationId = String(row.source_id ?? "");
  const restaurantId = String(row.restaurant_id ?? "");
  const active = await allocationStillActive(db, restaurantId, allocationId);
  if (!active) {
    await blockClaimedReceipt(
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
    .from("guest_payment_invoice_allocations")
    .select("id, invoice_id, amount, reverses_allocation_id")
    .eq("id", allocationId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const row = mapAllocation(fiscalRecord(result.data));
  if (!row || row.amount <= 0 || row.reversesId) return false;
  const siblings = await allocationRows(db, restaurantId, row.invoiceId);
  return !isReversed(row, siblings);
}

async function blockClaimedReceipt(db: Db, row: Record<string, unknown>, message: string) {
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

type InvoiceFiscalContext = {
  invoiceId: string | null;
  invoiceNumber: string | null;
  currency: string;
  timezone: string;
  hasAdjustingNotes: boolean;
  paymentKinds: Map<string, "payment" | "deposit" | "other">;
  allocations: AllocationRow[];
  registrations: StoredRegistration[];
  original: SalesReceiptFiscalInputOriginal;
  originalRegistrationId: string | null;
  integrationId: string;
  connection: SalesReceiptConnection;
};

type SalesReceiptConnection = {
  enabled: boolean;
  taxpayerTin: string;
  client: string;
  deviceId: string;
  credentialsConfigured: boolean;
};

type SalesReceiptFiscalInputOriginal = SalesReceiptContextOriginal;

type SalesReceiptContextOriginal = {
  status: string;
  irn: string | null;
  documentNumber: string | null;
  requestSnapshot: unknown;
} | null;

type AllocationFiscalContext = InvoiceFiscalContext & {
  allocation: AllocationRow;
  assessment: SalesReceiptFiscalAssessment;
};

async function loadAllocationFiscalContext(
  db: Db,
  restaurantId: string,
  allocationId: string,
): Promise<AllocationFiscalContext> {
  const result = await db
    .from("guest_payment_invoice_allocations")
    .select("id, invoice_id, payment_transaction_id, amount, created_at, reverses_allocation_id")
    .eq("id", allocationId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const allocation = mapAllocation(fiscalRecord(result.data));
  if (result.error || !allocation) {
    throw new FiscalError("FISCAL_NOT_ELIGIBLE", "That payment allocation was not found.");
  }
  const invoice = await loadInvoiceFiscalContext(db, restaurantId, allocation.invoiceId);
  return {
    ...invoice,
    allocation,
    assessment: assessAllocation(allocation, invoice),
  };
}

async function loadInvoiceFiscalContext(
  db: Db,
  restaurantId: string,
  invoiceId: string,
): Promise<InvoiceFiscalContext> {
  const invoiceResult = await db
    .from("guest_folio_invoices")
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
    .eq("guest_invoice_id", invoiceId);
  const noteRows = fiscalRecords((await notes).data).filter(
    (row) => row.note_type === "credit" || row.note_type === "debit",
  );
  const originalResult = invoice
    ? await db
        .from("fiscal_registrations")
        .select("id, status, external_irn, external_document_number, request_snapshot")
        .eq("restaurant_id", restaurantId)
        .eq("source_type", "guest_invoice")
        .eq("source_id", invoiceId)
        .eq("fiscal_document_type", "INV")
        .maybeSingle()
    : null;
  const originalRow = originalResult ? fiscalRecord(originalResult.data) : null;
  const registrationResult = await db
    .from("fiscal_registrations")
    .select(
      "id, source_id, status, trnx_id, external_irn, external_document_number, signed_qr, last_error_message, request_snapshot",
    )
    .eq("restaurant_id", restaurantId)
    .eq("source_type", "guest_allocation")
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
  const timezone = text(fiscalRecord(property.data)?.timezone) ?? "UTC";
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
  return {
    invoiceId: invoice ? invoiceId : null,
    invoiceNumber: text(invoice?.issued_number),
    currency: invoiceCurrency(snapshot),
    timezone,
    hasAdjustingNotes: noteRows.length > 0,
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

function assessAllocation(
  allocation: AllocationRow,
  context: InvoiceFiscalContext,
): SalesReceiptFiscalAssessment {
  const earlier = context.allocations
    .filter((row) => row.amount > 0 && !row.reversesId && !isReversed(row, context.allocations))
    .sort(byAllocationEvent)
    .filter((row) => compareAllocations(row, allocation) < 0);
  return assessSalesReceiptFiscal(allocation.id, {
    amount: allocation.amount,
    createdAt: allocation.createdAt,
    reversed: isReversed(allocation, context.allocations),
    reversalRow: allocation.amount < 0 || Boolean(allocation.reversesId),
    paymentKind: context.paymentKinds.get(allocation.paymentId) ?? "other",
    currency: context.currency,
    invoiceNumber: context.invoiceNumber,
    timezone: context.timezone,
    hasAdjustingNotes: context.hasAdjustingNotes,
    priors: earlier.map((row) => ({
      amount: row.amount,
      fiscalRegistered: findRegistration(context.registrations, row.id)?.status === "REGISTERED",
    })),
    connection: context.connection,
    originalRegistration: context.original,
  });
}

function presentAllocation(
  context: InvoiceFiscalContext,
  allocation: AllocationRow,
  registration: StoredRegistration | null,
): GuestSalesReceiptLine {
  const assessment = assessAllocation(allocation, context);
  const reversed = isReversed(allocation, context.allocations);
  const stored = registration ? salesReceiptPreviewFromPayload(registration.request) : null;
  const fresh = assessment.ok ? assessment.preview : assessment.projection;
  const preview = stored ? { ...stored, invoiceNumber: context.invoiceNumber } : fresh;
  const warning = reversed && registration ? SALES_RECEIPT_REVERSAL_WARNING : null;
  const view = registration
    ? {
        id: registration.id,
        trnxId: registration.trnxId,
        documentNumber: registration.documentNumber,
        irn: registration.irn,
        lastError: registration.lastError,
        qrSrc: fiscalQrSrc(registration.signedQr),
        qrStored: Boolean(registration.signedQr),
      }
    : null;
  if (registration?.status === "REGISTERED") {
    return line(allocation, reversed, "registered", [], warning, false, false, preview, view);
  }
  if (registration?.status === "PENDING") {
    return line(allocation, reversed, "queued", [], warning, false, false, preview, view);
  }
  if (!assessment.ok) {
    return line(
      allocation,
      reversed,
      "not_eligible",
      assessment.reasons,
      warning,
      false,
      false,
      preview,
      view,
    );
  }
  if (!registration) {
    return line(allocation, reversed, "not_registered", [], null, true, false, preview, null);
  }
  return line(allocation, reversed, "failed", [], warning, false, true, preview, view);
}

function line(
  allocation: AllocationRow,
  reversed: boolean,
  status: GuestSalesReceiptLine["status"],
  reasons: string[],
  warning: string | null,
  canRegister: boolean,
  canRetry: boolean,
  preview: SalesReceiptPreview | null,
  registration: SalesReceiptRegistrationView | null,
): GuestSalesReceiptLine {
  return {
    allocationId: allocation.id,
    allocatedAt: allocation.createdAt,
    amount: allocation.amount,
    reversed,
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
    .from("guest_payment_invoice_allocations")
    .select("id, invoice_id, payment_transaction_id, amount, created_at, reverses_allocation_id")
    .eq("restaurant_id", restaurantId)
    .eq("invoice_id", invoiceId);
  return fiscalRecords((await result).data)
    .map((row) => mapAllocation(row))
    .filter((row): row is AllocationRow => row != null);
}

async function paymentKind(
  db: Db,
  restaurantId: string,
  paymentId: string,
): Promise<"payment" | "deposit" | "other"> {
  const result = await db
    .from("folio_transactions")
    .select("id, transaction_type, amount")
    .eq("id", paymentId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const row = fiscalRecord(result.data);
  const type = text(row?.transaction_type);
  if (type === "deposit" || type === "deposit_received") return "deposit";
  if (type === "payment" && numberValue(row?.amount) < 0) return "payment";
  return "other";
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
      connection: emptyConnection(),
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

function emptyConnection(): SalesReceiptConnection {
  return {
    enabled: false,
    taxpayerTin: "",
    client: "",
    deviceId: "",
    credentialsConfigured: false,
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
    signedQr: text(row.signed_qr),
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

function byAllocationEvent(left: AllocationRow, right: AllocationRow) {
  return compareAllocations(left, right);
}

function compareAllocations(left: AllocationRow, right: AllocationRow) {
  const time = left.createdAt.localeCompare(right.createdAt);
  return time === 0 ? left.id.localeCompare(right.id) : time;
}

function invoiceCurrency(snapshot: unknown): string {
  const row = record(snapshot);
  const property = record(row?.property);
  const folio = record(row?.folio);
  return text(property?.currencyCode) ?? text(folio?.currency) ?? "";
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
