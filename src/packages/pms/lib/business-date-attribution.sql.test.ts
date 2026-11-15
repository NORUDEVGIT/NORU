import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

/**
 * Executes migrations 0208 and 0209 against stub tables in PGlite. Skipped when
 * PGlite is not installed:
 *   PGLITE_MODULE=/tmp/pgl/node_modules/@electric-sql/pglite/dist/index.js \
 *     tsx --test src/packages/pms/lib/business-date-attribution.sql.test.ts
 * The FOR SHARE / FOR UPDATE interleave needs two sessions and is covered by
 * the source scan in business-date-attribution.test.ts.
 */

type Db = {
  exec: (sql: string) => Promise<unknown>;
  query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

async function loadPglite(): Promise<(new () => Db) | null> {
  const raw = process.env.PGLITE_MODULE ?? "@electric-sql/pglite";
  const specifier = isAbsolute(raw) ? pathToFileURL(raw).href : raw;
  try {
    const mod = (await import(/* @vite-ignore */ specifier)) as { PGlite: new () => Db };
    return mod.PGlite;
  } catch {
    return null;
  }
}

const PGlite = await loadPglite();

const R1 = "00000000-0000-0000-0000-000000000001";
const R_BAD = "00000000-0000-0000-0000-000000000002";
const MEMBER = "00000000-0000-0000-0000-0000000000aa";

const STUB_SCHEMA = `
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE public.restaurants (
  id uuid PRIMARY KEY, business_date date, timezone text, business_date_blockers jsonb
);
CREATE TABLE public.restaurant_users (id uuid PRIMARY KEY);
CREATE TABLE public.hotel_cashier_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid, membership_id uuid,
  status text DEFAULT 'open', opened_at timestamptz DEFAULT now(), closed_at timestamptz, notes text
);
CREATE TABLE public.folio_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid,
  hotel_cashier_shift_id uuid, posted_at timestamptz DEFAULT now()
);
CREATE TABLE public.hotel_drawer_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid, hotel_cashier_shift_id uuid,
  movement_type text NOT NULL DEFAULT 'cash_in', created_at timestamptz DEFAULT now()
);
CREATE TABLE public.business_date_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid,
  old_business_date date, new_business_date date, reason text, changed_by_membership_id uuid
);
CREATE TABLE public.guest_folio_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid, issued_at timestamptz DEFAULT now()
);
CREATE TABLE public.financial_account_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid, issued_at timestamptz DEFAULT now()
);
CREATE TABLE public.invoice_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid, issued_at timestamptz DEFAULT now()
);
CREATE TABLE public.guest_payment_invoice_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.guest_deposit_invoice_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.folio_deposit_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.financial_account_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.withholding_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.fiscal_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid, source_type text, source_id uuid,
  created_at timestamptz DEFAULT now()
);

-- Existing append-only guard, as on the real table.
CREATE FUNCTION public.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'append-only'; END; $$;
CREATE TRIGGER folio_transactions_no_mutation BEFORE UPDATE ON public.folio_transactions
  FOR EACH ROW EXECUTE FUNCTION public.reject_mutation();

CREATE TABLE public.night_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid, business_date date,
  status text DEFAULT 'open', summary jsonb, closed_by_membership_id uuid, closed_at timestamptz
);
CREATE TABLE public.night_audit_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), night_audit_run_id uuid, severity text,
  status text DEFAULT 'open', exception_type text, reference_type text, reference_id uuid
);
CREATE TABLE public.night_audit_fiscal_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  night_audit_run_id uuid NOT NULL REFERENCES public.night_audit_runs(id),
  exception_id uuid NOT NULL REFERENCES public.night_audit_exceptions(id),
  business_date date NOT NULL,
  exception_type text NOT NULL,
  fiscal_status text NOT NULL,
  fiscal_reference text,
  reason text NOT NULL,
  reason_category text,
  overridden_by_membership_id uuid NOT NULL REFERENCES public.restaurant_users(id),
  overridden_at timestamptz NOT NULL DEFAULT now(),
  invalidated_at timestamptz,
  invalidated_reason text
);
CREATE UNIQUE INDEX night_audit_fiscal_overrides_active_exception_idx
  ON public.night_audit_fiscal_overrides (exception_id) WHERE invalidated_at IS NULL;
CREATE TABLE public.pms_permissions (
  code text PRIMARY KEY, module text, function text, action text, name text,
  description text, sensitive boolean, active boolean,
  CONSTRAINT pms_permissions_action_check CHECK (action IN ('view'))
);
`;

const SEED_BEFORE_MIGRATION = `
INSERT INTO public.restaurants VALUES ('${R1}', NULL, 'Africa/Addis_Ababa'), ('${R_BAD}', NULL, 'Not/AZone');
INSERT INTO public.restaurant_users VALUES ('${MEMBER}');
-- 22:30Z is 01:30 next day in Addis Ababa (UTC+3).
INSERT INTO public.folio_transactions (restaurant_id, posted_at)
  VALUES ('${R1}', '2026-10-21T22:30:00Z'), ('${R_BAD}', '2026-10-21T22:30:00Z');
`;

async function migratedDb(): Promise<Db> {
  const db = new PGlite!();
  await db.exec(STUB_SCHEMA);
  await db.exec(SEED_BEFORE_MIGRATION);
  await db.exec(read("supabase/migrations/0208_business_date_attribution.sql"));
  await db.exec(read("supabase/migrations/0209_night_audit_persistent_fiscal_override.sql"));
  await db.exec(read("supabase/migrations/0210_open_cashier_shift_hard_block.sql"));
  return db;
}

async function rejects(db: Db, sql: string, pattern: RegExp) {
  await assert.rejects(db.exec(sql), (error: Error) => pattern.test(error.message));
}

describe("business date attribution in SQL", { skip: PGlite ? false : "PGlite not installed" }, () => {
  it("backfills from the property-local date, falling back to UTC for a bad zone", async () => {
    const db = await migratedDb();
    const { rows } = await db.query<{ restaurant_id: string; business_date: string }>(
      "SELECT restaurant_id, business_date::text FROM public.folio_transactions ORDER BY restaurant_id",
    );
    assert.deepEqual(
      rows.map((row) => row.business_date),
      ["2026-10-22", "2026-10-21"],
    );
  });

  it("stamps the property business date and ignores a client value", async () => {
    const db = await migratedDb();
    await db.exec(`UPDATE public.restaurants SET business_date = '2026-10-20' WHERE id = '${R1}'`);
    const { rows } = await db.query<{ business_date: string }>(
      `INSERT INTO public.folio_transactions (restaurant_id, business_date)
       VALUES ('${R1}', '2030-01-01') RETURNING business_date::text`,
    );
    assert.equal(rows[0]?.business_date, "2026-10-20");
  });

  it("cash on the current drawer keeps that day, and a later post without a shift takes today", async () => {
    const db = await migratedDb();
    await db.exec(`UPDATE public.restaurants SET business_date = '2026-10-20' WHERE id = '${R1}'`);
    const shift = await db.query<{ id: string; business_date: string }>(
      `INSERT INTO public.hotel_cashier_shifts (restaurant_id) VALUES ('${R1}') RETURNING id, business_date::text`,
    );
    const shiftId = shift.rows[0]!.id;
    assert.equal(shift.rows[0]?.business_date, "2026-10-20");
    const cash = await db.query<{ business_date: string }>(
      `INSERT INTO public.folio_transactions (restaurant_id, hotel_cashier_shift_id)
       VALUES ('${R1}', '${shiftId}') RETURNING business_date::text`,
    );
    const movement = await db.query<{ business_date: string }>(
      `INSERT INTO public.hotel_drawer_movements (restaurant_id, hotel_cashier_shift_id, movement_type)
       VALUES ('${R1}', '${shiftId}', 'cash_in') RETURNING business_date::text`,
    );
    assert.equal(cash.rows[0]?.business_date, "2026-10-20");
    assert.equal(movement.rows[0]?.business_date, "2026-10-20");

    await db.exec(`UPDATE public.restaurants SET business_date = '2026-10-21' WHERE id = '${R1}'`);
    const card = await db.query<{ business_date: string }>(
      `INSERT INTO public.folio_transactions (restaurant_id) VALUES ('${R1}') RETURNING business_date::text`,
    );
    assert.equal(card.rows[0]?.business_date, "2026-10-21");
    await rejects(
      db,
      `INSERT INTO public.folio_transactions (restaurant_id, hotel_cashier_shift_id) VALUES ('${R1}', '${shiftId}')`,
      /CASHIER_SHIFT_CLOSED_DATE/,
    );
    await rejects(
      db,
      `INSERT INTO public.hotel_drawer_movements (restaurant_id, hotel_cashier_shift_id, movement_type)
       VALUES ('${R1}', '${shiftId}', 'cash_out')`,
      /CASHIER_SHIFT_CLOSED_DATE/,
    );
    const closing = await db.query<{ id: string }>(
      `INSERT INTO public.hotel_drawer_movements (restaurant_id, hotel_cashier_shift_id, movement_type)
       VALUES ('${R1}', '${shiftId}', 'close_count') RETURNING id`,
    );
    assert.ok(closing.rows[0]?.id);
  });

  it("refuses to close the business date while a shift is open, and ignores another property", async () => {
    const db = await migratedDb();
    await db.exec(`UPDATE public.restaurants SET business_date = '2026-10-21' WHERE id = '${R1}'`);
    const run = await db.query<{ id: string }>(
      `INSERT INTO public.night_audit_runs (restaurant_id, business_date) VALUES ('${R1}', '2026-10-21') RETURNING id`,
    );
    const shift = await db.query<{ id: string }>(
      `INSERT INTO public.hotel_cashier_shifts (restaurant_id) VALUES ('${R1}') RETURNING id`,
    );
    await assert.rejects(
      db.query("SELECT public.close_business_date($1, $2, '{}'::jsonb, $3)", [R1, run.rows[0]!.id, MEMBER]),
      /OPEN_CASHIER_SHIFT/,
    );
    await db.exec(
      `UPDATE public.hotel_cashier_shifts SET restaurant_id = '${R_BAD}' WHERE id = '${shift.rows[0]!.id}'`,
    );
    await db.query("SELECT public.close_business_date($1, $2, '{}'::jsonb, $3)", [R1, run.rows[0]!.id, MEMBER]);
    const { rows } = await db.query<{ business_date: string }>(
      `SELECT business_date::text FROM public.restaurants WHERE id = '${R1}'`,
    );
    assert.equal(rows[0]?.business_date, "2026-10-22");
  });

  it("recovery cannot move the date past an open shift on another day", async () => {
    const db = await migratedDb();
    await db.exec(`UPDATE public.restaurants SET business_date = '2026-10-21' WHERE id = '${R1}'`);
    await db.exec(`INSERT INTO public.hotel_cashier_shifts (restaurant_id) VALUES ('${R1}')`);
    await assert.rejects(
      db.query("SELECT public.adjust_business_date($1, $2, $3, $4, $5)", [
        R1,
        "2026-10-21",
        "2026-10-22",
        "Correct the hotel day",
        MEMBER,
      ]),
      /OPEN_CASHIER_SHIFT/,
    );
    const { rows } = await db.query<{ business_date: string }>(
      `SELECT business_date::text FROM public.restaurants WHERE id = '${R1}'`,
    );
    assert.equal(rows[0]?.business_date, "2026-10-21");
  });

  it("a fiscal registration takes its source document's day", async () => {
    const db = await migratedDb();
    await db.exec(`UPDATE public.restaurants SET business_date = '2026-10-20' WHERE id = '${R1}'`);
    const invoice = await db.query<{ id: string }>(
      `INSERT INTO public.guest_folio_invoices (restaurant_id) VALUES ('${R1}') RETURNING id`,
    );
    await db.exec(`UPDATE public.restaurants SET business_date = '2026-10-23' WHERE id = '${R1}'`);
    const reg = await db.query<{ business_date: string }>(
      `INSERT INTO public.fiscal_registrations (restaurant_id, source_type, source_id)
       VALUES ('${R1}', 'guest_invoice', '${invoice.rows[0]!.id}') RETURNING business_date::text`,
    );
    assert.equal(reg.rows[0]?.business_date, "2026-10-20");
  });

  it("refuses to move a stamped business date", async () => {
    const db = await migratedDb();
    const shift = await db.query<{ id: string }>(
      `INSERT INTO public.hotel_cashier_shifts (restaurant_id) VALUES ('${R1}') RETURNING id`,
    );
    await rejects(
      db,
      `UPDATE public.hotel_cashier_shifts SET business_date = '2031-01-01' WHERE id = '${shift.rows[0]!.id}'`,
      /BUSINESS_DATE_IMMUTABLE/,
    );
    await db.exec(`UPDATE public.hotel_cashier_shifts SET status = 'closed' WHERE id = '${shift.rows[0]!.id}'`);
  });

  it("fails a write when the business date cannot be resolved", async () => {
    const db = await migratedDb();
    await rejects(
      db,
      `INSERT INTO public.folio_transactions (restaurant_id) VALUES ('${R_BAD}')`,
      /BUSINESS_DATE_UNRESOLVED/,
    );
    await rejects(
      db,
      `INSERT INTO public.folio_transactions (restaurant_id) VALUES ('00000000-0000-0000-0000-0000000000ff')`,
      /BUSINESS_DATE_UNRESOLVED/,
    );
  });
});

describe("persistent fiscal override in SQL", { skip: PGlite ? false : "PGlite not installed" }, () => {
  const SOURCE = "00000000-0000-0000-0000-0000000000cc";

  async function runWithFiscalBlocker(db: Db) {
    await db.exec(`UPDATE public.restaurants SET business_date = '2026-10-21' WHERE id = '${R1}'`);
    const run = await db.query<{ id: string }>(
      `INSERT INTO public.night_audit_runs (restaurant_id, business_date) VALUES ('${R1}', '2026-10-21') RETURNING id`,
    );
    const exception = await db.query<{ id: string }>(
      `INSERT INTO public.night_audit_exceptions
         (night_audit_run_id, severity, exception_type, reference_type, reference_id)
       VALUES ('${run.rows[0]!.id}', 'blocking', 'fiscal_failed', 'guest_invoice', '${SOURCE}') RETURNING id`,
    );
    return { runId: run.rows[0]!.id, exceptionId: exception.rows[0]!.id };
  }

  async function persistentOverride(db: Db, runId: string, exceptionId: string) {
    const row = await db.query<{ id: string }>(
      `INSERT INTO public.night_audit_fiscal_overrides
         (restaurant_id, night_audit_run_id, exception_id, business_date, exception_type, fiscal_status,
          reason, reason_category, overridden_by_membership_id, scope, source_type, source_id)
       VALUES ('${R1}', '${runId}', '${exceptionId}', '2026-10-20', 'fiscal_failed', 'FAILED',
          'Authority outage', 'provider_outage', '${MEMBER}', 'persistent', 'guest_invoice', '${SOURCE}')
       RETURNING id`,
    );
    return row.rows[0]!.id;
  }

  it("seeds the permission under the widened action check", async () => {
    const db = await migratedDb();
    const { rows } = await db.query<{ action: string; sensitive: boolean }>(
      "SELECT action, sensitive FROM public.pms_permissions WHERE code = 'night_audit.fiscal.override_persistent'",
    );
    assert.deepEqual(rows, [{ action: "override_persistent", sensitive: true }]);
  });

  it("a persistent waiver for the exact source lets a later run close", async () => {
    const db = await migratedDb();
    const earlier = await runWithFiscalBlocker(db);
    await persistentOverride(db, earlier.runId, earlier.exceptionId);
    const today = await runWithFiscalBlocker(db);
    await db.query("SELECT public.close_business_date($1, $2, '{}'::jsonb, $3)", [R1, today.runId, MEMBER]);
    const { rows } = await db.query<{ business_date: string }>(
      `SELECT business_date::text FROM public.restaurants WHERE id = '${R1}'`,
    );
    assert.equal(rows[0]?.business_date, "2026-10-22");
  });

  it("does not cover another source, and stops covering once revoked", async () => {
    const db = await migratedDb();
    const earlier = await runWithFiscalBlocker(db);
    const overrideId = await persistentOverride(db, earlier.runId, earlier.exceptionId);
    const today = await runWithFiscalBlocker(db);
    await db.exec(
      `INSERT INTO public.night_audit_exceptions
         (night_audit_run_id, severity, exception_type, reference_type, reference_id)
       VALUES ('${today.runId}', 'blocking', 'fiscal_failed', 'guest_invoice', gen_random_uuid())`,
    );
    await assert.rejects(
      db.query("SELECT public.close_business_date($1, $2, '{}'::jsonb, $3)", [R1, today.runId, MEMBER]),
      /BLOCKING_EXCEPTIONS_OPEN/,
    );

    const fresh = await migratedDb();
    const e1 = await runWithFiscalBlocker(fresh);
    const revokedId = await persistentOverride(fresh, e1.runId, e1.exceptionId);
    await fresh.exec(
      `UPDATE public.night_audit_fiscal_overrides
          SET revoked_at = now(), revocation_reason = 'Registered manually'
        WHERE id = '${revokedId}'`,
    );
    const e2 = await runWithFiscalBlocker(fresh);
    await assert.rejects(
      fresh.query("SELECT public.close_business_date($1, $2, '{}'::jsonb, $3)", [R1, e2.runId, MEMBER]),
      /BLOCKING_EXCEPTIONS_OPEN/,
    );
    assert.ok(overrideId);
  });

  it("guards authorization fields, revocation is write-once, and persistent needs a source", async () => {
    const db = await migratedDb();
    const run = await runWithFiscalBlocker(db);
    const id = await persistentOverride(db, run.runId, run.exceptionId);
    await rejects(
      db,
      `UPDATE public.night_audit_fiscal_overrides SET reason = 'edited' WHERE id = '${id}'`,
      /FISCAL_OVERRIDE_IMMUTABLE/,
    );
    await db.exec(
      `UPDATE public.night_audit_fiscal_overrides SET revoked_at = now(), revocation_reason = 'done' WHERE id = '${id}'`,
    );
    await rejects(
      db,
      `UPDATE public.night_audit_fiscal_overrides SET revocation_reason = 'changed' WHERE id = '${id}'`,
      /FISCAL_OVERRIDE_IMMUTABLE/,
    );
    await rejects(
      db,
      `INSERT INTO public.night_audit_fiscal_overrides
         (restaurant_id, night_audit_run_id, exception_id, business_date, exception_type, fiscal_status,
          reason, reason_category, overridden_by_membership_id, scope)
       VALUES ('${R1}', '${run.runId}', '${run.exceptionId}', '2026-10-21', 'fiscal_failed', 'FAILED',
          'x', 'provider_outage', '${MEMBER}', 'persistent')`,
      /persistent_source_check/,
    );
  });
});
