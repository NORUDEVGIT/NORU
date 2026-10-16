-- Package ↔ rate plan inclusion semantics.
--
-- Sequential after 0119. Dual-lane: byte-identical copies live in
--   supabase/migrations/0120_pms_package_rate_plan_inclusion.sql
--   drizzle/migrations/0120_pms_package_rate_plan_inclusion.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0120_pms_package_rate_plan_inclusion.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   ALTER TABLE public.pms_package_rate_plans
--     DROP CONSTRAINT IF EXISTS pms_package_rate_plans_inclusion_type_check;
--   ALTER TABLE public.pms_package_rate_plans
--     DROP COLUMN IF EXISTS inclusion_type;
--
-- Scope fence — this migration explicitly does NOT touch:
--   hotel_rate_plans meal/cancellation/refundability columns
--   pms_meal_plans, pms_package_components
--   folio_transactions, price_hotel_stay body, nightly snapshots
--   hotel_reservations columns, guarantee, deposits, PCI
--   restaurants.pms_property_setup_status
--
-- Existing mapping rows default to optional: they currently prove eligibility
-- only, not inclusion in the rate.
-- No seed.

ALTER TABLE public.pms_package_rate_plans
  ADD COLUMN IF NOT EXISTS inclusion_type text NOT NULL DEFAULT 'optional';

ALTER TABLE public.pms_package_rate_plans
  DROP CONSTRAINT IF EXISTS pms_package_rate_plans_inclusion_type_check;

ALTER TABLE public.pms_package_rate_plans
  ADD CONSTRAINT pms_package_rate_plans_inclusion_type_check
  CHECK (inclusion_type IN ('included', 'optional'));

COMMENT ON COLUMN public.pms_package_rate_plans.inclusion_type IS
  'included = merchandised as included in the rate. optional = eligible add-on. Does not change price_hotel_stay or post folio charges.';
