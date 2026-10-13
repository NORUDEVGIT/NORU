/**
 * Outbox skeleton. P1 claims rows and records that document handlers are not
 * enabled. It never calls a document registration endpoint and never marks a
 * row REGISTERED.
 *
 * No job runner exists in this repository (no pg_cron, no Vercel cron). The
 * processor is a protected server function. With no financial hooks in P1 it
 * normally finds zero rows.
 */
import {
  FiscalError,
  classifyFiscalFailure,
  fiscalRecord,
  nextFiscalRetryAt,
  type FiscalDb,
  type FiscalDocumentType,
} from "./fiscal.types.ts";

type Db = FiscalDb;

const HANDLER_NOTE = "Fiscal document registration is not enabled yet.";

export function dispatchFiscalDocument(_type: FiscalDocumentType): never {
  throw new FiscalError("FISCAL_HANDLER_NOT_ENABLED", HANDLER_NOTE);
}

export async function processFiscalOutbox(db: Db, limit = 10): Promise<{ processed: number }> {
  const claimed = await db.rpc("claim_fiscal_registrations", { _limit: limit });
  if (claimed.error) throw new Error(claimed.error.message);
  const rows = Array.isArray(claimed.data) ? claimed.data : [];
  for (const row of rows) {
    await recordUnsupported(db, row);
  }
  return { processed: rows.length };
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
