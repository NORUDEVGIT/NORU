/**
 * Fiscal outbox. Claims due registrations and sends only a guest B2C INV.
 * Every other document type is recorded as not enabled and is not marked
 * REGISTERED.
 *
 * No job runner exists in this repository (no pg_cron, no Vercel cron). The
 * processor runs from the guest-invoice register action and from the manager
 * outbox server function.
 */
import { sendClaimedGuestInvoice } from "./fiscal-guest-invoice.server.ts";
import { p2HandlerEnabled } from "./fiscal-guest-invoice.ts";
import {
  FiscalError,
  classifyFiscalFailure,
  fiscalRecord,
  nextFiscalRetryAt,
  type FiscalDb,
  type FiscalDocumentType,
} from "./fiscal.types.ts";

type Db = FiscalDb;

const HANDLER_NOTE = "That fiscal document type is not enabled yet.";

export function dispatchFiscalDocument(type: FiscalDocumentType, sourceType = ""): void {
  if (p2HandlerEnabled(type, sourceType)) return;
  throw new FiscalError("FISCAL_HANDLER_NOT_ENABLED", HANDLER_NOTE);
}

export async function processFiscalOutbox(db: Db, limit = 10): Promise<{ processed: number }> {
  const claimed = await db.rpc("claim_fiscal_registrations", { _limit: limit });
  if (claimed.error) throw new Error(claimed.error.message);
  const rows = claimedRows(claimed.data);
  for (const row of rows) {
    if (p2HandlerEnabled(String(row.fiscal_document_type ?? ""), String(row.source_type ?? ""))) {
      await sendClaimedGuestInvoice(db, row);
    } else {
      await recordUnsupported(db, row);
    }
  }
  return { processed: rows.length };
}

function claimedRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  return isRecord(data) ? [data] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function recordUnsupported(db: Db, row: Record<string, unknown>) {
  const started = new Date();
  const attemptNumber = Number(row.attempt_count ?? 0) + 1;
  const classified = classifyFiscalFailure({ code: "FISCAL_HANDLER_NOT_ENABLED" });
  const next = classified.retryable ? nextFiscalRetryAt(attemptNumber, started) : null;
  await db.from("fiscal_registration_attempts").insert({
    registration_id: row.id,
    attempt_number: attemptNumber,
    endpoint: "not_enabled",
    request_hash: row.request_hash ?? null,
    request_body: { note: HANDLER_NOTE },
    http_status: null,
    response_body: null,
    outcome: "fatal_error",
    error_code: "FISCAL_HANDLER_NOT_ENABLED",
    error_message: HANDLER_NOTE,
    started_at: started.toISOString(),
    completed_at: new Date().toISOString(),
    latency_ms: 0,
  });
  await db
    .from("fiscal_registrations")
    .update({
      status: "FAILED",
      attempt_count: attemptNumber,
      next_attempt_at: next ? next.toISOString() : null,
      last_error_code: "FISCAL_HANDLER_NOT_ENABLED",
      last_error_message: HANDLER_NOTE,
    })
    .eq("id", row.id);
}

export async function retryFiscalRegistration(db: Db, registrationId: string): Promise<void> {
  const current = await db
    .from("fiscal_registrations")
    .select("id, status")
    .eq("id", registrationId)
    .maybeSingle();
  const row = fiscalRecord(current.data);
  if (current.error || !row) throw new Error("That fiscal registration does not exist.");
  if (row.status !== "FAILED" && row.status !== "BLOCKED") {
    throw new Error("Only a failed fiscal registration can be retried.");
  }
  const updated = await db
    .from("fiscal_registrations")
    .update({ status: "PENDING", next_attempt_at: new Date().toISOString(), last_error_code: null })
    .eq("id", registrationId);
  if (updated.error) throw new Error(updated.error.message);
}
