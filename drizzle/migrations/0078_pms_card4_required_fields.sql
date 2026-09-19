-- PMS Property Setup Card 4 — Guest & Services, Phase 2: Required Fields.
-- Sequential after 0077. Dual-lane copies live in
--   supabase/migrations/0078_pms_card4_required_fields.sql
--   drizzle/migrations/0078_pms_card4_required_fields.sql
--
-- Catalogue only. Does not alter guest_profiles, SET3 guest rules, or
-- operational guest create / check-in / reservation forms.

CREATE TABLE IF NOT EXISTS public.pms_guest_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  field_type text NOT NULL,
  description text,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  check_in boolean NOT NULL DEFAULT false,
  reservation boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  lookup_source text,
  document_type_ids uuid[] NOT NULL DEFAULT '{}',
  min_value numeric,
  max_value numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pms_guest_fields_name_unique UNIQUE (restaurant_id, name),
  CONSTRAINT pms_guest_fields_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_guest_fields_code_format CHECK (code = upper(code) AND code ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  CONSTRAINT pms_guest_fields_type_check CHECK (
    field_type IN (
      'text', 'phone', 'email', 'number', 'date',
      'select', 'multi_select', 'document', 'address', 'lookup'
    )
  ),
  CONSTRAINT pms_guest_fields_lookup_check CHECK (
    lookup_source IS NULL OR lookup_source IN ('company', 'travel_agent', 'group')
  ),
  CONSTRAINT pms_guest_fields_options_array CHECK (jsonb_typeof(options) = 'array'),
  CONSTRAINT pms_guest_fields_inactive_not_required CHECK (NOT (active = false AND required = true))
);

CREATE INDEX IF NOT EXISTS pms_guest_fields_restaurant_idx
  ON public.pms_guest_fields(restaurant_id, display_order);

COMMENT ON TABLE public.pms_guest_fields IS
  'Card 4 Required Fields catalogue. Not SET3 guest-rules JSON and not operational guest forms.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_guest_fields TO authenticated;
GRANT ALL ON public.pms_guest_fields TO service_role;
ALTER TABLE public.pms_guest_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read guest fields" ON public.pms_guest_fields;
CREATE POLICY "Members read guest fields" ON public.pms_guest_fields
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert guest fields" ON public.pms_guest_fields;
CREATE POLICY "Managers insert guest fields" ON public.pms_guest_fields
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update guest fields" ON public.pms_guest_fields;
CREATE POLICY "Managers update guest fields" ON public.pms_guest_fields
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete guest fields" ON public.pms_guest_fields;
CREATE POLICY "Managers delete guest fields" ON public.pms_guest_fields
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_guest_fields_updated_at ON public.pms_guest_fields;
CREATE TRIGGER set_pms_guest_fields_updated_at
  BEFORE UPDATE ON public.pms_guest_fields
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
