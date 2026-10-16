-- Rate plan policy bundle: link each hotel_rate_plans row to the existing
-- deposit and no-show masters. Does not create a second catalogue.
--
-- Sequential after 0145. Dual-lane: byte-identical copies live in
--   supabase/migrations/0146_hotel_rate_plan_deposit_no_show.sql
--   drizzle/migrations/0146_hotel_rate_plan_deposit_no_show.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Does not edit earlier migrations.
-- Does not change cancellation_policy_id, refundability_id, meal_plan_id,
-- min_advance_days, or max_advance_days.
-- Does not add Early Departure or Additional Policy.
--
-- Deposit master already has UNIQUE (id, restaurant_id):
--   pms_deposit_policies_id_restaurant_unique
-- No-show master needs that key before a composite foreign key can use it.
--
-- Rollback:
--   ALTER TABLE public.hotel_rate_plans
--     DROP CONSTRAINT IF EXISTS hotel_rate_plans_deposit_same_property,
--     DROP CONSTRAINT IF EXISTS hotel_rate_plans_no_show_same_property;
--   DROP INDEX IF EXISTS public.hotel_rate_plans_deposit_policy_idx;
--   DROP INDEX IF EXISTS public.hotel_rate_plans_no_show_policy_idx;
--   ALTER TABLE public.hotel_rate_plans
--     DROP COLUMN IF EXISTS deposit_policy_id,
--     DROP COLUMN IF EXISTS no_show_policy_id;
--   ALTER TABLE public.pms_no_show_policies
--     DROP CONSTRAINT IF EXISTS pms_no_show_policies_id_restaurant_unique;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pms_no_show_policies_id_restaurant_unique'
      AND conrelid = 'public.pms_no_show_policies'::regclass
  ) THEN
    ALTER TABLE public.pms_no_show_policies
      ADD CONSTRAINT pms_no_show_policies_id_restaurant_unique
      UNIQUE (id, restaurant_id);
  END IF;
END $$;

ALTER TABLE public.hotel_rate_plans
  ADD COLUMN IF NOT EXISTS deposit_policy_id uuid,
  ADD COLUMN IF NOT EXISTS no_show_policy_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hotel_rate_plans_deposit_same_property'
      AND conrelid = 'public.hotel_rate_plans'::regclass
  ) THEN
    ALTER TABLE public.hotel_rate_plans
      ADD CONSTRAINT hotel_rate_plans_deposit_same_property
      FOREIGN KEY (deposit_policy_id, restaurant_id)
      REFERENCES public.pms_deposit_policies(id, restaurant_id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hotel_rate_plans_no_show_same_property'
      AND conrelid = 'public.hotel_rate_plans'::regclass
  ) THEN
    ALTER TABLE public.hotel_rate_plans
      ADD CONSTRAINT hotel_rate_plans_no_show_same_property
      FOREIGN KEY (no_show_policy_id, restaurant_id)
      REFERENCES public.pms_no_show_policies(id, restaurant_id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS hotel_rate_plans_deposit_policy_idx
  ON public.hotel_rate_plans (restaurant_id, deposit_policy_id);

CREATE INDEX IF NOT EXISTS hotel_rate_plans_no_show_policy_idx
  ON public.hotel_rate_plans (restaurant_id, no_show_policy_id);

COMMENT ON COLUMN public.hotel_rate_plans.deposit_policy_id IS
  'Optional link to the Payments & Deposits catalogue (pms_deposit_policies). Not a posted deposit and not part of room price.';
COMMENT ON COLUMN public.hotel_rate_plans.no_show_policy_id IS
  'Optional link to the existing no-show catalogue (pms_no_show_policies). Not a posted no-show charge.';
