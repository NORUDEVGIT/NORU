-- PMS-SET3 — Meal/package catalogues, guest rules, ID/VIP (Issue #68).
--
-- Sequential after 0048. Dual-lane with
--   supabase/migrations/0049_pms_set3_rates_guest_rules.sql
-- Additive only. No privileged functions. No seed hotel sample data.
-- RLS on new tables matches rooms: members read; owner/manager write.
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- Rate-plan COUNT uses existing hotel_rate_plans.active and does not need 0049.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0049_pms_set3_rates_guest_rules.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   ALTER TABLE public.restaurants
--     DROP COLUMN IF EXISTS pms_rate_package_rules,
--     DROP COLUMN IF EXISTS pms_guest_profile_rules;
--   DROP TABLE IF EXISTS public.pms_guest_vip_levels;
--   DROP TABLE IF EXISTS public.pms_guest_id_types;
--   DROP TABLE IF EXISTS public.pms_packages;
--   DROP TABLE IF EXISTS public.pms_meal_plans;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS pms_rate_package_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pms_guest_profile_rules jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.restaurants.pms_rate_package_rules IS
  'PMS-SET3 optional rate/package rule snapshot. Null-object until stored.';
COMMENT ON COLUMN public.restaurants.pms_guest_profile_rules IS
  'PMS-SET3 guest required fields, consent defaults and company-relationship flag. Draft until savedAt.';

GRANT SELECT (pms_rate_package_rules, pms_guest_profile_rules) ON public.restaurants TO authenticated;

CREATE TABLE IF NOT EXISTS public.pms_meal_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  included jsonb NOT NULL DEFAULT '[]'::jsonb,
  chargeable jsonb NOT NULL DEFAULT '[]'::jsonb,
  applicable_outlet_ids uuid[] NOT NULL DEFAULT '{}',
  tax_posture text NOT NULL DEFAULT 'inherit',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_meal_plans_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_meal_plans_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_meal_plans_type_check CHECK (type IN ('room_only','breakfast','half_board','full_board','all_inclusive','custom')),
  CONSTRAINT pms_meal_plans_tax_posture_check CHECK (tax_posture IN ('inclusive','exclusive','inherit'))
);

CREATE INDEX IF NOT EXISTS pms_meal_plans_restaurant_idx
  ON public.pms_meal_plans(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_meal_plans TO authenticated;
GRANT ALL ON public.pms_meal_plans TO service_role;
ALTER TABLE public.pms_meal_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read meal plans" ON public.pms_meal_plans;
CREATE POLICY "Members read meal plans" ON public.pms_meal_plans
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert meal plans" ON public.pms_meal_plans;
CREATE POLICY "Managers insert meal plans" ON public.pms_meal_plans
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update meal plans" ON public.pms_meal_plans;
CREATE POLICY "Managers update meal plans" ON public.pms_meal_plans
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete meal plans" ON public.pms_meal_plans;
CREATE POLICY "Managers delete meal plans" ON public.pms_meal_plans
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_meal_plans_updated_at ON public.pms_meal_plans;
CREATE TRIGGER set_pms_meal_plans_updated_at BEFORE UPDATE ON public.pms_meal_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.pms_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  type text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  inclusion jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_packages_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_packages_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_packages_type_check CHECK (type IN ('accommodation','business','romantic','conference','custom'))
);

CREATE INDEX IF NOT EXISTS pms_packages_restaurant_idx
  ON public.pms_packages(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_packages TO authenticated;
GRANT ALL ON public.pms_packages TO service_role;
ALTER TABLE public.pms_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read packages" ON public.pms_packages;
CREATE POLICY "Members read packages" ON public.pms_packages
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert packages" ON public.pms_packages;
CREATE POLICY "Managers insert packages" ON public.pms_packages
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update packages" ON public.pms_packages;
CREATE POLICY "Managers update packages" ON public.pms_packages
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete packages" ON public.pms_packages;
CREATE POLICY "Managers delete packages" ON public.pms_packages
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_packages_updated_at ON public.pms_packages;
CREATE TRIGGER set_pms_packages_updated_at BEFORE UPDATE ON public.pms_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.pms_guest_id_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_guest_id_types_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_guest_id_types_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_guest_id_types_restaurant_idx
  ON public.pms_guest_id_types(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_guest_id_types TO authenticated;
GRANT ALL ON public.pms_guest_id_types TO service_role;
ALTER TABLE public.pms_guest_id_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read guest id types" ON public.pms_guest_id_types;
CREATE POLICY "Members read guest id types" ON public.pms_guest_id_types
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert guest id types" ON public.pms_guest_id_types;
CREATE POLICY "Managers insert guest id types" ON public.pms_guest_id_types
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update guest id types" ON public.pms_guest_id_types;
CREATE POLICY "Managers update guest id types" ON public.pms_guest_id_types
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete guest id types" ON public.pms_guest_id_types;
CREATE POLICY "Managers delete guest id types" ON public.pms_guest_id_types
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_guest_id_types_updated_at ON public.pms_guest_id_types;
CREATE TRIGGER set_pms_guest_id_types_updated_at BEFORE UPDATE ON public.pms_guest_id_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.pms_guest_vip_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_guest_vip_levels_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_guest_vip_levels_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_guest_vip_levels_restaurant_idx
  ON public.pms_guest_vip_levels(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_guest_vip_levels TO authenticated;
GRANT ALL ON public.pms_guest_vip_levels TO service_role;
ALTER TABLE public.pms_guest_vip_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read guest vip levels" ON public.pms_guest_vip_levels;
CREATE POLICY "Members read guest vip levels" ON public.pms_guest_vip_levels
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert guest vip levels" ON public.pms_guest_vip_levels;
CREATE POLICY "Managers insert guest vip levels" ON public.pms_guest_vip_levels
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update guest vip levels" ON public.pms_guest_vip_levels;
CREATE POLICY "Managers update guest vip levels" ON public.pms_guest_vip_levels
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete guest vip levels" ON public.pms_guest_vip_levels;
CREATE POLICY "Managers delete guest vip levels" ON public.pms_guest_vip_levels
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_guest_vip_levels_updated_at ON public.pms_guest_vip_levels;
CREATE TRIGGER set_pms_guest_vip_levels_updated_at BEFORE UPDATE ON public.pms_guest_vip_levels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pms_meal_plans IS
  'PMS-SET3 meal-plan catalogue. Rate calendar stays on /restaurant/pms/rates-revenue.';
COMMENT ON TABLE public.pms_packages IS
  'PMS-SET3 package catalogue. Empty is a Warning, not a go-live block.';
COMMENT ON TABLE public.pms_guest_id_types IS
  'PMS-SET3 ID-type catalogue. Empty is a Warning, not a go-live block.';
COMMENT ON TABLE public.pms_guest_vip_levels IS
  'PMS-SET3 VIP-level catalogue. Empty is a Warning, not a go-live block.';
