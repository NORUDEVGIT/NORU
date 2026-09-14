-- PMS-SET1 — Foundation Settings columns on restaurants (Issue #59).
--
-- Additive only. No new tables, RPCs, privileged functions, seed hotel data,
-- or RLS changes.
--
-- IN THE PR ONLY — do not apply to live until Abel instructs after merge.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f supabase/migrations/0047_pms_set1_foundation_settings.sql
--
-- Rollback:
--   ALTER TABLE public.restaurants
--     DROP COLUMN IF EXISTS property_code,
--     DROP COLUMN IF EXISTS legal_name,
--     DROP COLUMN IF EXISTS property_type,
--     DROP COLUMN IF EXISTS tax_identities,
--     DROP COLUMN IF EXISTS check_in_time,
--     DROP COLUMN IF EXISTS check_out_time,
--     DROP COLUMN IF EXISTS hotel_day_open,
--     DROP COLUMN IF EXISTS tax_name,
--     DROP COLUMN IF EXISTS cancel_window_hours,
--     DROP COLUMN IF EXISTS cancel_fee_basis,
--     DROP COLUMN IF EXISTS noshow_fee_basis,
--     DROP COLUMN IF EXISTS deposit_required,
--     DROP COLUMN IF EXISTS deposit_type,
--     DROP COLUMN IF EXISTS deposit_value,
--     DROP COLUMN IF EXISTS early_checkin_allowed,
--     DROP COLUMN IF EXISTS early_checkin_fee,
--     DROP COLUMN IF EXISTS early_checkin_needs_approval,
--     DROP COLUMN IF EXISTS late_checkout_allowed,
--     DROP COLUMN IF EXISTS late_checkout_fee,
--     DROP COLUMN IF EXISTS late_checkout_needs_approval,
--     DROP COLUMN IF EXISTS pms_set1_live;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS property_code text,
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS property_type text,
  ADD COLUMN IF NOT EXISTS tax_identities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS check_in_time time,
  ADD COLUMN IF NOT EXISTS check_out_time time,
  ADD COLUMN IF NOT EXISTS hotel_day_open boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS tax_name text,
  ADD COLUMN IF NOT EXISTS cancel_window_hours int,
  ADD COLUMN IF NOT EXISTS cancel_fee_basis text,
  ADD COLUMN IF NOT EXISTS noshow_fee_basis text,
  ADD COLUMN IF NOT EXISTS deposit_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_type text,
  ADD COLUMN IF NOT EXISTS deposit_value numeric,
  ADD COLUMN IF NOT EXISTS early_checkin_allowed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS early_checkin_fee numeric,
  ADD COLUMN IF NOT EXISTS early_checkin_needs_approval boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_checkout_allowed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_checkout_fee numeric,
  ADD COLUMN IF NOT EXISTS late_checkout_needs_approval boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pms_set1_live boolean NOT NULL DEFAULT false;

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_property_type_check;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_property_type_check
  CHECK (property_type IS NULL OR property_type IN ('hotel', 'guesthouse', 'apartment_hotel', 'other'));

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_cancel_fee_basis_check;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_cancel_fee_basis_check
  CHECK (cancel_fee_basis IS NULL OR cancel_fee_basis IN ('percent_stay', 'fixed', 'first_night'));

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_noshow_fee_basis_check;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_noshow_fee_basis_check
  CHECK (noshow_fee_basis IS NULL OR noshow_fee_basis IN ('percent_stay', 'fixed', 'first_night'));

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_deposit_type_check;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_deposit_type_check
  CHECK (deposit_type IS NULL OR deposit_type IN ('none', 'percent', 'fixed', 'first_night'));

COMMENT ON COLUMN public.restaurants.property_code IS
  'PMS-SET1 optional property code. Null until stored.';
COMMENT ON COLUMN public.restaurants.legal_name IS
  'PMS-SET1 legal name for documents. Null until stored.';
COMMENT ON COLUMN public.restaurants.business_date IS
  'Night Audit business date. Read-only in Settings. Advances only via close_business_date.';
COMMENT ON COLUMN public.restaurants.pms_set1_live IS
  'PMS-SET1 owner Activate flag. Distinct from platform approval.';
