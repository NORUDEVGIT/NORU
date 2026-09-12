-- FO-FS3 — Cancel / No-show fee defaults (Issue #37).
--
-- Additive only. Property fee switches live on public.restaurants (same
-- pattern as timezone / tax_rate). Required=true + default=0 matches Abel's
-- approved plan: fee required ON, agent-entered amount unless a default > 0.
--
-- Does NOT rewrite Cashiering RPCs or add a forfeit/apply-deposit type.
-- Does NOT add a % cancel ladder, Void, or FO refund workstation.
--
-- Do not apply to live until Abel instructs after merge.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0042_fo_cancel_noshow_fee_defaults.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   ALTER TABLE public.restaurants
--     DROP COLUMN IF EXISTS fo_cancel_fee_required,
--     DROP COLUMN IF EXISTS fo_cancel_fee_default,
--     DROP COLUMN IF EXISTS fo_noshow_fee_required,
--     DROP COLUMN IF EXISTS fo_noshow_fee_default;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS fo_cancel_fee_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fo_cancel_fee_default numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fo_noshow_fee_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fo_noshow_fee_default numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_fo_cancel_fee_default_check;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_fo_cancel_fee_default_check
  CHECK (fo_cancel_fee_default >= 0);

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_fo_noshow_fee_default_check;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_fo_noshow_fee_default_check
  CHECK (fo_noshow_fee_default >= 0);

COMMENT ON COLUMN public.restaurants.fo_cancel_fee_required IS
  'FO-FS3: when true, cancel requires a posted Cancel fee or supervisor waive.';
COMMENT ON COLUMN public.restaurants.fo_cancel_fee_default IS
  'FO-FS3: 0 = agent-entered cancel fee; >0 prefills the stepper amount.';
COMMENT ON COLUMN public.restaurants.fo_noshow_fee_required IS
  'FO-FS3: when true, no-show requires a posted No-show charge or supervisor waive.';
COMMENT ON COLUMN public.restaurants.fo_noshow_fee_default IS
  'FO-FS3: 0 = agent-entered no-show charge; >0 prefills the stepper amount.';

GRANT SELECT (fo_cancel_fee_required, fo_cancel_fee_default, fo_noshow_fee_required, fo_noshow_fee_default)
  ON public.restaurants TO authenticated;
