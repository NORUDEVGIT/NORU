-- PMS Guest Profile gap-edit #3 — Travel Agency enrichment + Company Payment Terms
-- (Issue #115). Spec AC-GE3-1…18. Linking reuses Wave 4 guest_account_links —
-- no new link table.
--
-- DATABASE IMPACT: YES — additive nullable columns on guest_account_masters.
-- Sequential after 0057. Dual-lane with
--   supabase/migrations/0058_pms_travel_agency_enrichment.sql
-- No new tables. No privileged functions. No seed hotel sample data.
-- No commission settlement engine. No rate engine. No AP/AR / city-ledger.
-- No e-sign. No Group form schema. No KYC / police export.
--
-- Additive RLS matching existing guest_account_masters owner/manager policies
-- (those policies cover the new columns). Entitlement model is not changed.
-- RLS unchanged. Receptionist residual PRESERVED. No privileged functions.
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY HELD until Abel/PM approval after merge. Non-prod first, then production.
-- Surfaces degrade honestly (`TA_ENRICHMENT_UNAVAILABLE`) until apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0058_pms_travel_agency_enrichment.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   ALTER TABLE public.guest_account_masters
--     DROP CONSTRAINT IF EXISTS guest_account_masters_agency_type_other_check,
--     DROP CONSTRAINT IF EXISTS guest_account_masters_agency_type_check,
--     DROP CONSTRAINT IF EXISTS guest_account_masters_commission_type_check,
--     DROP CONSTRAINT IF EXISTS guest_account_masters_contract_status_check;
--   ALTER TABLE public.guest_account_masters
--     DROP COLUMN IF EXISTS agency_type,
--     DROP COLUMN IF EXISTS agency_type_other,
--     DROP COLUMN IF EXISTS website,
--     DROP COLUMN IF EXISTS billing_contact_name,
--     DROP COLUMN IF EXISTS iata_license_number,
--     DROP COLUMN IF EXISTS license_expiry_date,
--     DROP COLUMN IF EXISTS commission_label,
--     DROP COLUMN IF EXISTS commission_type,
--     DROP COLUMN IF EXISTS commission_currency_note,
--     DROP COLUMN IF EXISTS contract_reference,
--     DROP COLUMN IF EXISTS contract_start_date,
--     DROP COLUMN IF EXISTS contract_end_date,
--     DROP COLUMN IF EXISTS contract_status,
--     DROP COLUMN IF EXISTS contract_signed_with,
--     DROP COLUMN IF EXISTS payment_terms,
--     DROP COLUMN IF EXISTS credit_limit_note,
--     DROP COLUMN IF EXISTS billing_instruction;

-- ---------------------------------------------------------------------------
-- TA enrichment — legal name remains guest_account_masters.name
-- Trade / display name reuses trade_name (GE1). Group rows leave these null.
-- Payment terms trio is shared with Company (Scope C). Not AP/AR.
-- Commission / negotiated_rate_reference are name/code strings only.
-- ---------------------------------------------------------------------------

ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS agency_type text,
  ADD COLUMN IF NOT EXISTS agency_type_other text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS billing_contact_name text,
  ADD COLUMN IF NOT EXISTS iata_license_number text,
  ADD COLUMN IF NOT EXISTS license_expiry_date date,
  ADD COLUMN IF NOT EXISTS commission_label text,
  ADD COLUMN IF NOT EXISTS commission_type text,
  ADD COLUMN IF NOT EXISTS commission_currency_note text,
  ADD COLUMN IF NOT EXISTS contract_reference text,
  ADD COLUMN IF NOT EXISTS contract_start_date date,
  ADD COLUMN IF NOT EXISTS contract_end_date date,
  ADD COLUMN IF NOT EXISTS contract_status text,
  ADD COLUMN IF NOT EXISTS contract_signed_with text,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS credit_limit_note text,
  ADD COLUMN IF NOT EXISTS billing_instruction text;

COMMENT ON COLUMN public.guest_account_masters.agency_type IS
  'Travel Agent type: ota | local | online | other. Null on Company / Group.';
COMMENT ON COLUMN public.guest_account_masters.commission_label IS
  'Commission percent or rule label. Reference only — not a settlement engine.';
COMMENT ON COLUMN public.guest_account_masters.commission_type IS
  'percent | fixed_note. Reference only — not live commission posting.';
COMMENT ON COLUMN public.guest_account_masters.negotiated_rate_reference IS
  'Name or code string only. Not a rate engine and not a live rate product.';
COMMENT ON COLUMN public.guest_account_masters.payment_terms IS
  'Terms code or label (e.g. NET15). Text only — not AP/AR or city-ledger.';
COMMENT ON COLUMN public.guest_account_masters.credit_limit_note IS
  'Credit limit note. Text only — not an AR ledger.';
COMMENT ON COLUMN public.guest_account_masters.billing_instruction IS
  'Billing instruction. Text only — not folio routing or city-ledger.';
COMMENT ON COLUMN public.guest_account_masters.iata_license_number IS
  'IATA / license number. Staff text only — not government KYC.';
COMMENT ON COLUMN public.guest_account_masters.contract_status IS
  'draft | active | expired. Text/dates only — no e-sign product.';

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_agency_type_check;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_agency_type_check CHECK (
    agency_type IS NULL OR agency_type IN (
      'ota',
      'local',
      'online',
      'other'
    )
  );

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_agency_type_other_check;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_agency_type_other_check CHECK (
    agency_type IS DISTINCT FROM 'other'
    OR btrim(coalesce(agency_type_other, '')) <> ''
  );

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_commission_type_check;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_commission_type_check CHECK (
    commission_type IS NULL OR commission_type IN (
      'percent',
      'fixed_note'
    )
  );

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_contract_status_check;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_contract_status_check CHECK (
    contract_status IS NULL OR contract_status IN (
      'draft',
      'active',
      'expired'
    )
  );
