-- Reusable cancellation-policy time-window rules.
--
-- Sequential after 0122. Dual-lane: byte-identical copies live in
--   supabase/migrations/0123_pms_cancellation_policy_rules.sql
--   drizzle/migrations/0123_pms_cancellation_policy_rules.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0123_pms_cancellation_policy_rules.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   ALTER TABLE public.pms_rate_cancellation_policies
--     DROP CONSTRAINT IF EXISTS pms_rate_cancellation_policies_policy_kind_check,
--     DROP CONSTRAINT IF EXISTS pms_rate_cancellation_policies_window_unit_check,
--     DROP CONSTRAINT IF EXISTS pms_rate_cancellation_policies_cutoff_time_check;
--   ALTER TABLE public.pms_rate_cancellation_policies
--     DROP COLUMN IF EXISTS policy_kind,
--     DROP COLUMN IF EXISTS window_value,
--     DROP COLUMN IF EXISTS window_unit,
--     DROP COLUMN IF EXISTS cutoff_time;
--   -- restore 0116 penalty check if needed
--
-- Scope fence — this migration explicitly does NOT touch:
--   hotel_rate_plans meal/cancellation/refundability FKs
--   price_hotel_stay body, nightly snapshots
--   hotel_reservations columns (snapshot JSON extra keys are additive later)
--   folio posting / FO cancel-fee defaults
--
-- Existing rows: policy_kind flexible, window_unit hours, window_value from
-- deadline_hours, cutoff_time null. deadline_hours is kept for 0116 snapshots.
-- No seed.

ALTER TABLE public.pms_rate_cancellation_policies
  ADD COLUMN IF NOT EXISTS policy_kind text NOT NULL DEFAULT 'flexible';

ALTER TABLE public.pms_rate_cancellation_policies
  ADD COLUMN IF NOT EXISTS window_value integer;

ALTER TABLE public.pms_rate_cancellation_policies
  ADD COLUMN IF NOT EXISTS window_unit text NOT NULL DEFAULT 'hours_before_arrival';

ALTER TABLE public.pms_rate_cancellation_policies
  ADD COLUMN IF NOT EXISTS cutoff_time text;

UPDATE public.pms_rate_cancellation_policies
   SET window_value = deadline_hours
 WHERE window_value IS NULL
   AND deadline_hours IS NOT NULL;

ALTER TABLE public.pms_rate_cancellation_policies
  DROP CONSTRAINT IF EXISTS pms_rate_cancellation_policies_policy_kind_check;
ALTER TABLE public.pms_rate_cancellation_policies
  ADD CONSTRAINT pms_rate_cancellation_policies_policy_kind_check
  CHECK (policy_kind IN ('free_cancellation', 'non_refundable', 'flexible'));

ALTER TABLE public.pms_rate_cancellation_policies
  DROP CONSTRAINT IF EXISTS pms_rate_cancellation_policies_window_unit_check;
ALTER TABLE public.pms_rate_cancellation_policies
  ADD CONSTRAINT pms_rate_cancellation_policies_window_unit_check
  CHECK (window_unit IN ('hours_before_arrival', 'days_before_arrival'));

ALTER TABLE public.pms_rate_cancellation_policies
  DROP CONSTRAINT IF EXISTS pms_rate_cancellation_policies_window_value_check;
ALTER TABLE public.pms_rate_cancellation_policies
  ADD CONSTRAINT pms_rate_cancellation_policies_window_value_check
  CHECK (window_value IS NULL OR window_value >= 0);

ALTER TABLE public.pms_rate_cancellation_policies
  DROP CONSTRAINT IF EXISTS pms_rate_cancellation_policies_cutoff_time_check;
ALTER TABLE public.pms_rate_cancellation_policies
  ADD CONSTRAINT pms_rate_cancellation_policies_cutoff_time_check
  CHECK (cutoff_time IS NULL OR cutoff_time ~ '^[0-2][0-9]:[0-5][0-9]$');

ALTER TABLE public.pms_rate_cancellation_policies
  DROP CONSTRAINT IF EXISTS pms_rate_cancellation_policies_penalty_type_check;
ALTER TABLE public.pms_rate_cancellation_policies
  ADD CONSTRAINT pms_rate_cancellation_policies_penalty_type_check
  CHECK (penalty_type IN (
    'none', 'percent', 'nights', 'fixed',
    'percentage', 'first_night', 'fixed_amount', 'full_stay'
  ));

COMMENT ON COLUMN public.pms_rate_cancellation_policies.policy_kind IS
  'Reusable rule kind. Guest merchandising. Not a folio cancel posting rule.';
COMMENT ON COLUMN public.pms_rate_cancellation_policies.window_value IS
  'Count of hours or days before arrival. Not an absolute reservation date.';
COMMENT ON COLUMN public.pms_rate_cancellation_policies.window_unit IS
  'hours_before_arrival | days_before_arrival.';
COMMENT ON COLUMN public.pms_rate_cancellation_policies.cutoff_time IS
  'Property-local HH:mm cutoff. Null means date-only merchandising.';
