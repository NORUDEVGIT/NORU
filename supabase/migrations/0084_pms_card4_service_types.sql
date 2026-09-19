-- PMS Property Setup Card 4 — Guest & Services, Guest Service Types Phase 2:
-- Service Types.
-- Sequential after 0083. Dual-lane copies live in
--   supabase/migrations/0084_pms_card4_service_types.sql
--   drizzle/migrations/0084_pms_card4_service_types.sql
--
-- Catalogue only. Child of Card 4 service categories. Does not alter SET5
-- request-type catalogues, operational guest-services requests, or guest
-- profile rules.

CREATE TABLE IF NOT EXISTS public.pms_guest_service_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.pms_guest_service_categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  code text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pms_guest_service_types_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_guest_service_types_name_per_category UNIQUE (category_id, name),
  CONSTRAINT pms_guest_service_types_code_format CHECK (
    code = upper(code) AND code ~ '^[A-Z][A-Z0-9_]{1,19}$'
  ),
  CONSTRAINT pms_guest_service_types_order_positive CHECK (display_order > 0)
);

CREATE INDEX IF NOT EXISTS pms_guest_service_types_restaurant_idx
  ON public.pms_guest_service_types(restaurant_id, category_id, display_order);

COMMENT ON TABLE public.pms_guest_service_types IS
  'Card 4 Guest Service Types catalogue. Child of pms_guest_service_categories. Not operational guest requests.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_guest_service_types TO authenticated;
GRANT ALL ON public.pms_guest_service_types TO service_role;
ALTER TABLE public.pms_guest_service_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read service types" ON public.pms_guest_service_types;
CREATE POLICY "Members read service types" ON public.pms_guest_service_types
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert service types" ON public.pms_guest_service_types;
CREATE POLICY "Managers insert service types" ON public.pms_guest_service_types
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update service types" ON public.pms_guest_service_types;
CREATE POLICY "Managers update service types" ON public.pms_guest_service_types
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete service types" ON public.pms_guest_service_types;
CREATE POLICY "Managers delete service types" ON public.pms_guest_service_types
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_guest_service_types_updated_at ON public.pms_guest_service_types;
CREATE TRIGGER set_pms_guest_service_types_updated_at
  BEFORE UPDATE ON public.pms_guest_service_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
