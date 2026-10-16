-- Rate Plan composition: meal board FK + cancellation/refundability catalogues.
--
-- Sequential after 0118. Dual-lane: byte-identical copies live in
--   supabase/migrations/0119_pms_rate_plan_composition.sql
--   drizzle/migrations/0119_pms_rate_plan_composition.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0119_pms_rate_plan_composition.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   ALTER TABLE public.hotel_rate_plans
--     DROP CONSTRAINT IF EXISTS hotel_rate_plans_meal_plan_same_property,
--     DROP CONSTRAINT IF EXISTS hotel_rate_plans_cancellation_same_property,
--     DROP CONSTRAINT IF EXISTS hotel_rate_plans_refundability_same_property,
--     DROP COLUMN IF EXISTS meal_plan_id,
--     DROP COLUMN IF EXISTS cancellation_policy_id,
--     DROP COLUMN IF EXISTS refundability_id;
--   DROP TABLE IF EXISTS public.pms_rate_refundability_codes;
--   DROP TABLE IF EXISTS public.pms_rate_cancellation_policies;
--
-- Scope fence — this migration explicitly does NOT touch:
--   pms_package_rate_plans / pms_package_components / package inclusion flags
--   folio_transactions, price_hotel_stay body, nightly snapshots
--   hotel_reservations columns, guarantee, deposits, PCI
--   Card 3 meal-plan writers (pms_meal_plans rows stay Card 3 owned)
--   restaurants.pms_property_setup_status
--   no new audit table — reuse public.restaurant_staff_audit_log
--
-- No seed. No types.ts regen from this file.

CREATE TABLE IF NOT EXISTS public.pms_rate_cancellation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_rate_cancellation_policies_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_rate_cancellation_policies_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_rate_cancellation_policies_code_check CHECK (code ~ '^[A-Z0-9_]{1,30}$'),
  CONSTRAINT pms_rate_cancellation_policies_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT pms_rate_cancellation_policies_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  )
);

CREATE INDEX IF NOT EXISTS pms_rate_cancellation_policies_restaurant_idx
  ON public.pms_rate_cancellation_policies(restaurant_id, code);

COMMENT ON TABLE public.pms_rate_cancellation_policies IS
  'Card 2 rate-plan cancellation catalogue. Setup only. Not a reservation cancel event.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_rate_cancellation_policies TO authenticated;
GRANT ALL ON public.pms_rate_cancellation_policies TO service_role;
ALTER TABLE public.pms_rate_cancellation_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read rate cancellation policies" ON public.pms_rate_cancellation_policies;
CREATE POLICY "Members read rate cancellation policies" ON public.pms_rate_cancellation_policies
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert rate cancellation policies" ON public.pms_rate_cancellation_policies;
CREATE POLICY "Managers insert rate cancellation policies" ON public.pms_rate_cancellation_policies
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update rate cancellation policies" ON public.pms_rate_cancellation_policies;
CREATE POLICY "Managers update rate cancellation policies" ON public.pms_rate_cancellation_policies
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete rate cancellation policies" ON public.pms_rate_cancellation_policies;
CREATE POLICY "Managers delete rate cancellation policies" ON public.pms_rate_cancellation_policies
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_rate_cancellation_policies_updated_at ON public.pms_rate_cancellation_policies;
CREATE TRIGGER set_pms_rate_cancellation_policies_updated_at
  BEFORE UPDATE ON public.pms_rate_cancellation_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.pms_rate_refundability_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  kind text NOT NULL DEFAULT 'refundable',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_rate_refundability_codes_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_rate_refundability_codes_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_rate_refundability_codes_code_check CHECK (code ~ '^[A-Z0-9_]{1,30}$'),
  CONSTRAINT pms_rate_refundability_codes_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT pms_rate_refundability_codes_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  ),
  CONSTRAINT pms_rate_refundability_codes_kind_check CHECK (
    kind IN ('refundable', 'non_refundable', 'partially_refundable')
  )
);

CREATE INDEX IF NOT EXISTS pms_rate_refundability_codes_restaurant_idx
  ON public.pms_rate_refundability_codes(restaurant_id, code);

COMMENT ON TABLE public.pms_rate_refundability_codes IS
  'Card 2 rate-plan refundability catalogue. Setup only. Not a folio refund.';
COMMENT ON COLUMN public.pms_rate_refundability_codes.kind IS
  'refundable | non_refundable | partially_refundable. Quote merchandising, not a cashiering posting rule.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_rate_refundability_codes TO authenticated;
GRANT ALL ON public.pms_rate_refundability_codes TO service_role;
ALTER TABLE public.pms_rate_refundability_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read rate refundability codes" ON public.pms_rate_refundability_codes;
CREATE POLICY "Members read rate refundability codes" ON public.pms_rate_refundability_codes
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert rate refundability codes" ON public.pms_rate_refundability_codes;
CREATE POLICY "Managers insert rate refundability codes" ON public.pms_rate_refundability_codes
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update rate refundability codes" ON public.pms_rate_refundability_codes;
CREATE POLICY "Managers update rate refundability codes" ON public.pms_rate_refundability_codes
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete rate refundability codes" ON public.pms_rate_refundability_codes;
CREATE POLICY "Managers delete rate refundability codes" ON public.pms_rate_refundability_codes
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_rate_refundability_codes_updated_at ON public.pms_rate_refundability_codes;
CREATE TRIGGER set_pms_rate_refundability_codes_updated_at
  BEFORE UPDATE ON public.pms_rate_refundability_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.hotel_rate_plans
  ADD COLUMN IF NOT EXISTS meal_plan_id uuid,
  ADD COLUMN IF NOT EXISTS cancellation_policy_id uuid,
  ADD COLUMN IF NOT EXISTS refundability_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hotel_rate_plans_meal_plan_same_property'
      AND conrelid = 'public.hotel_rate_plans'::regclass
  ) THEN
    ALTER TABLE public.hotel_rate_plans
      ADD CONSTRAINT hotel_rate_plans_meal_plan_same_property
      FOREIGN KEY (meal_plan_id, restaurant_id)
      REFERENCES public.pms_meal_plans(id, restaurant_id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hotel_rate_plans_cancellation_same_property'
      AND conrelid = 'public.hotel_rate_plans'::regclass
  ) THEN
    ALTER TABLE public.hotel_rate_plans
      ADD CONSTRAINT hotel_rate_plans_cancellation_same_property
      FOREIGN KEY (cancellation_policy_id, restaurant_id)
      REFERENCES public.pms_rate_cancellation_policies(id, restaurant_id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hotel_rate_plans_refundability_same_property'
      AND conrelid = 'public.hotel_rate_plans'::regclass
  ) THEN
    ALTER TABLE public.hotel_rate_plans
      ADD CONSTRAINT hotel_rate_plans_refundability_same_property
      FOREIGN KEY (refundability_id, restaurant_id)
      REFERENCES public.pms_rate_refundability_codes(id, restaurant_id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.hotel_rate_plans.meal_plan_id IS
  'Optional Card 3 meal-plan board for this rate. Setup FK only. Package maps stay eligibility.';
COMMENT ON COLUMN public.hotel_rate_plans.cancellation_policy_id IS
  'Optional Card 2 cancellation catalogue row. Not a reservation cancel.';
COMMENT ON COLUMN public.hotel_rate_plans.refundability_id IS
  'Optional Card 2 refundability catalogue row. Not a folio refund.';
