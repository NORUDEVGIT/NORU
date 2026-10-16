-- Early departure policy master and rate-plan link.
-- Configuration only. Does not change hotel_reservations.
--
-- Sequential after 0147. Dual-lane: byte-identical copies live in
--   supabase/migrations/0148_pms_early_departure_policies.sql
--   drizzle/migrations/0148_pms_early_departure_policies.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Does not edit 0146 or 0147.
-- Does not add a reservation early-departure id or snapshot.
-- Does not add Additional Policy.
-- Penalty values match pms_no_show_policies: none, first_night,
-- percent_stay, fixed_amount, full_stay.
--
-- Rollback:
--   ALTER TABLE public.hotel_rate_plans
--     DROP CONSTRAINT IF EXISTS hotel_rate_plans_early_departure_same_property;
--   DROP INDEX IF EXISTS public.hotel_rate_plans_early_departure_policy_idx;
--   ALTER TABLE public.hotel_rate_plans
--     DROP COLUMN IF EXISTS early_departure_policy_id;
--   DROP TABLE IF EXISTS public.pms_early_departure_policies;

CREATE TABLE IF NOT EXISTS public.pms_early_departure_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  penalty_type text NOT NULL,
  penalty_value numeric(12,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_early_departure_policies_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_early_departure_policies_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_early_departure_policies_code_check CHECK (
    code ~ '^[A-Z0-9_]{1,30}$'
  ),
  CONSTRAINT pms_early_departure_policies_name_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 120
  ),
  CONSTRAINT pms_early_departure_policies_penalty_type_check CHECK (
    penalty_type IN ('none', 'first_night', 'percent_stay', 'fixed_amount', 'full_stay')
  ),
  CONSTRAINT pms_early_departure_policies_penalty_value_check CHECK (
    penalty_value >= 0
    AND (
      (penalty_type IN ('none', 'first_night', 'full_stay') AND penalty_value = 0)
      OR (penalty_type = 'percent_stay' AND penalty_value <= 100)
      OR (penalty_type = 'fixed_amount')
    )
  ),
  CONSTRAINT pms_early_departure_policies_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  )
);

CREATE INDEX IF NOT EXISTS pms_early_departure_policies_restaurant_idx
  ON public.pms_early_departure_policies (restaurant_id, code);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_early_departure_policies TO authenticated;
GRANT ALL ON public.pms_early_departure_policies TO service_role;
ALTER TABLE public.pms_early_departure_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read pms early departure policies" ON public.pms_early_departure_policies;
CREATE POLICY "Members read pms early departure policies" ON public.pms_early_departure_policies
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "Managers write pms early departure policies" ON public.pms_early_departure_policies;
CREATE POLICY "Managers write pms early departure policies" ON public.pms_early_departure_policies
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );

DROP TRIGGER IF EXISTS set_pms_early_departure_policies_updated_at ON public.pms_early_departure_policies;
CREATE TRIGGER set_pms_early_departure_policies_updated_at
  BEFORE UPDATE ON public.pms_early_departure_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.hotel_rate_plans
  ADD COLUMN IF NOT EXISTS early_departure_policy_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hotel_rate_plans_early_departure_same_property'
      AND conrelid = 'public.hotel_rate_plans'::regclass
  ) THEN
    ALTER TABLE public.hotel_rate_plans
      ADD CONSTRAINT hotel_rate_plans_early_departure_same_property
      FOREIGN KEY (early_departure_policy_id, restaurant_id)
      REFERENCES public.pms_early_departure_policies(id, restaurant_id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS hotel_rate_plans_early_departure_policy_idx
  ON public.hotel_rate_plans (restaurant_id, early_departure_policy_id);

COMMENT ON TABLE public.pms_early_departure_policies IS
  'Rate & Pricing early departure catalogue. Not a posted checkout charge.';
COMMENT ON COLUMN public.hotel_rate_plans.early_departure_policy_id IS
  'Optional link to pms_early_departure_policies. Not copied onto reservations in this phase.';
