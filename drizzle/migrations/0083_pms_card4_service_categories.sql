-- PMS Property Setup Card 4 — Guest & Services, Guest Service Types Phase 1:
-- Service Categories.
-- Sequential after 0082. Dual-lane copies live in
--   supabase/migrations/0083_pms_card4_service_categories.sql
--   drizzle/migrations/0083_pms_card4_service_categories.sql
--
-- Catalogue only. Does not alter SET5 request-type catalogues, operational
-- guest-services requests, or guest profile rules.

CREATE TABLE IF NOT EXISTS public.pms_guest_service_categories (
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
  CONSTRAINT pms_guest_service_categories_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_guest_service_categories_code_format CHECK (
    code = upper(code) AND code ~ '^[A-Z][A-Z0-9_]{1,19}$'
  ),
  CONSTRAINT pms_guest_service_categories_order_positive CHECK (display_order > 0)
);

CREATE INDEX IF NOT EXISTS pms_guest_service_categories_restaurant_idx
  ON public.pms_guest_service_categories(restaurant_id, display_order);

COMMENT ON TABLE public.pms_guest_service_categories IS
  'Card 4 Guest Service Types categories. Not SET5 request types and not operational guest requests.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_guest_service_categories TO authenticated;
GRANT ALL ON public.pms_guest_service_categories TO service_role;
ALTER TABLE public.pms_guest_service_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read service categories" ON public.pms_guest_service_categories;
CREATE POLICY "Members read service categories" ON public.pms_guest_service_categories
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert service categories" ON public.pms_guest_service_categories;
CREATE POLICY "Managers insert service categories" ON public.pms_guest_service_categories
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update service categories" ON public.pms_guest_service_categories;
CREATE POLICY "Managers update service categories" ON public.pms_guest_service_categories
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete service categories" ON public.pms_guest_service_categories;
CREATE POLICY "Managers delete service categories" ON public.pms_guest_service_categories
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_guest_service_categories_updated_at ON public.pms_guest_service_categories;
CREATE TRIGGER set_pms_guest_service_categories_updated_at
  BEFORE UPDATE ON public.pms_guest_service_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
