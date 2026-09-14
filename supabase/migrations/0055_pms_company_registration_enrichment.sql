-- PMS Guest Profile gap-edit #1 — Company registration enrichment (Issue #103).
--
-- Sequential after 0054. Dual-lane with
--   drizzle/migrations/0055_pms_company_registration_enrichment.sql
-- Additive columns on guest_account_masters only. No new tables.
-- No privileged functions. No seed hotel sample data.
-- No rate engine. No Position/Department. No Group/TA form schema.
--
-- RLS unchanged — existing guest_account_masters owner/manager policies
-- cover the new columns. Entitlement model is not changed.
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY HELD until Abel/PM approval after merge.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f supabase/migrations/0055_pms_company_registration_enrichment.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   ALTER TABLE public.guest_account_masters
--     DROP CONSTRAINT IF EXISTS guest_account_masters_default_ta_same_property,
--     DROP CONSTRAINT IF EXISTS guest_account_masters_company_type_other_check,
--     DROP CONSTRAINT IF EXISTS guest_account_masters_company_type_check;
--   DROP INDEX IF EXISTS public.guest_account_masters_default_ta_idx;
--   ALTER TABLE public.guest_account_masters
--     DROP COLUMN IF EXISTS trade_name,
--     DROP COLUMN IF EXISTS company_type,
--     DROP COLUMN IF EXISTS company_type_other,
--     DROP COLUMN IF EXISTS tax_id,
--     DROP COLUMN IF EXISTS business_registration_number,
--     DROP COLUMN IF EXISTS phone_alt,
--     DROP COLUMN IF EXISTS email_alt,
--     DROP COLUMN IF EXISTS primary_contact_name,
--     DROP COLUMN IF EXISTS address_line2,
--     DROP COLUMN IF EXISTS region,
--     DROP COLUMN IF EXISTS postal_code,
--     DROP COLUMN IF EXISTS corporate_account_reference,
--     DROP COLUMN IF EXISTS negotiated_rate_reference,
--     DROP COLUMN IF EXISTS default_travel_agent_master_id,
--     DROP COLUMN IF EXISTS source_of_business;

-- ---------------------------------------------------------------------------
-- Company enrichment — legal name remains guest_account_masters.name
-- Trade / display name is trade_name. Group / TA rows leave these null.
-- ---------------------------------------------------------------------------

ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS trade_name text,
  ADD COLUMN IF NOT EXISTS company_type text,
  ADD COLUMN IF NOT EXISTS company_type_other text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS business_registration_number text,
  ADD COLUMN IF NOT EXISTS phone_alt text,
  ADD COLUMN IF NOT EXISTS email_alt text,
  ADD COLUMN IF NOT EXISTS primary_contact_name text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS corporate_account_reference text,
  ADD COLUMN IF NOT EXISTS negotiated_rate_reference text,
  ADD COLUMN IF NOT EXISTS default_travel_agent_master_id uuid,
  ADD COLUMN IF NOT EXISTS source_of_business text;

COMMENT ON COLUMN public.guest_account_masters.name IS
  'Legal / company name for Company masters. Display name for Group / TA.';
COMMENT ON COLUMN public.guest_account_masters.trade_name IS
  'Optional trade / display name. Legal name stays in name.';
COMMENT ON COLUMN public.guest_account_masters.negotiated_rate_reference IS
  'Name or code string only. Not a rate engine and not a live rate product.';
COMMENT ON COLUMN public.guest_account_masters.default_travel_agent_master_id IS
  'Optional default Travel Agent master (same property). Not typed-only text.';

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_company_type_check;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_company_type_check CHECK (
    company_type IS NULL OR company_type IN (
      'private_limited',
      'plc',
      'sole_proprietorship',
      'partnership',
      'ngo',
      'government',
      'other'
    )
  );

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_company_type_other_check;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_company_type_other_check CHECK (
    company_type IS DISTINCT FROM 'other'
    OR btrim(coalesce(company_type_other, '')) <> ''
  );

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_default_ta_same_property;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_default_ta_same_property
  FOREIGN KEY (default_travel_agent_master_id, restaurant_id)
  REFERENCES public.guest_account_masters(id, restaurant_id);

CREATE INDEX IF NOT EXISTS guest_account_masters_default_ta_idx
  ON public.guest_account_masters(restaurant_id, default_travel_agent_master_id)
  WHERE default_travel_agent_master_id IS NOT NULL;
