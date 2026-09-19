-- PMS Property Setup Card 4 — Guest & Services, Phase 4: Preferences.
-- Sequential after 0080. Dual-lane copies live in
--   supabase/migrations/0081_pms_card4_preferences.sql
--   drizzle/migrations/0081_pms_card4_preferences.sql
--
-- Catalogue only. Does not alter guest_preferences, Wave 2 pms_preference_options,
-- or operational guest preference collection.

CREATE TABLE IF NOT EXISTS public.pms_guest_preference_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pms_guest_pref_categories_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_guest_pref_categories_name_unique UNIQUE (restaurant_id, name),
  CONSTRAINT pms_guest_pref_categories_code_format CHECK (
    code = upper(code) AND code ~ '^[A-Z][A-Z0-9_]{1,19}$'
  ),
  CONSTRAINT pms_guest_pref_categories_order_positive CHECK (display_order > 0)
);

CREATE INDEX IF NOT EXISTS pms_guest_pref_categories_restaurant_idx
  ON public.pms_guest_preference_categories(restaurant_id, display_order);

COMMENT ON TABLE public.pms_guest_preference_categories IS
  'Card 4 preference categories. Not Wave 2 pms_preference_options and not guest preference values.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_guest_preference_categories TO authenticated;
GRANT ALL ON public.pms_guest_preference_categories TO service_role;
ALTER TABLE public.pms_guest_preference_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read preference categories" ON public.pms_guest_preference_categories;
CREATE POLICY "Members read preference categories" ON public.pms_guest_preference_categories
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert preference categories" ON public.pms_guest_preference_categories;
CREATE POLICY "Managers insert preference categories" ON public.pms_guest_preference_categories
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update preference categories" ON public.pms_guest_preference_categories;
CREATE POLICY "Managers update preference categories" ON public.pms_guest_preference_categories
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete preference categories" ON public.pms_guest_preference_categories;
CREATE POLICY "Managers delete preference categories" ON public.pms_guest_preference_categories
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_guest_pref_categories_updated_at ON public.pms_guest_preference_categories;
CREATE TRIGGER set_pms_guest_pref_categories_updated_at
  BEFORE UPDATE ON public.pms_guest_preference_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.pms_guest_preference_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.pms_guest_preference_categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  code text NOT NULL,
  value_type text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pms_guest_pref_types_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_guest_pref_types_name_per_category UNIQUE (category_id, name),
  CONSTRAINT pms_guest_pref_types_code_format CHECK (
    code = upper(code) AND code ~ '^[A-Z][A-Z0-9_]{1,31}$'
  ),
  CONSTRAINT pms_guest_pref_types_value_type_check CHECK (value_type IN ('single', 'multi')),
  CONSTRAINT pms_guest_pref_types_options_array CHECK (jsonb_typeof(options) = 'array'),
  CONSTRAINT pms_guest_pref_types_inactive_not_required CHECK (NOT (active = false AND required = true)),
  CONSTRAINT pms_guest_pref_types_order_positive CHECK (display_order > 0)
);

CREATE INDEX IF NOT EXISTS pms_guest_pref_types_restaurant_idx
  ON public.pms_guest_preference_types(restaurant_id, category_id, display_order);

COMMENT ON TABLE public.pms_guest_preference_types IS
  'Card 4 preference type definitions. Configuration only; no guest preference values.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_guest_preference_types TO authenticated;
GRANT ALL ON public.pms_guest_preference_types TO service_role;
ALTER TABLE public.pms_guest_preference_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read preference types" ON public.pms_guest_preference_types;
CREATE POLICY "Members read preference types" ON public.pms_guest_preference_types
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert preference types" ON public.pms_guest_preference_types;
CREATE POLICY "Managers insert preference types" ON public.pms_guest_preference_types
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update preference types" ON public.pms_guest_preference_types;
CREATE POLICY "Managers update preference types" ON public.pms_guest_preference_types
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete preference types" ON public.pms_guest_preference_types;
CREATE POLICY "Managers delete preference types" ON public.pms_guest_preference_types
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_guest_pref_types_updated_at ON public.pms_guest_preference_types;
CREATE TRIGGER set_pms_guest_pref_types_updated_at
  BEFORE UPDATE ON public.pms_guest_preference_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
