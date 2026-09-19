-- PMS Property Setup Card 4 — Guest & Services, Phase 6: Company & Business.
-- Sequential after 0081. Dual-lane copies live in
--   supabase/migrations/0082_pms_card4_company_business.sql
--   drizzle/migrations/0082_pms_card4_company_business.sql
--
-- Catalogue only. Does not store company billing, credit ledgers, invoices,
-- or operational guest/company records.

CREATE TABLE IF NOT EXISTS public.pms_business_profile_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  required_field_ids uuid[] NOT NULL DEFAULT '{}',
  tax_id_required boolean NOT NULL DEFAULT false,
  contact_required boolean NOT NULL DEFAULT false,
  credit_account_allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pms_business_profile_types_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_business_profile_types_code_format CHECK (
    code = upper(code) AND code ~ '^[A-Z][A-Z0-9]{1,11}$'
  )
);

CREATE INDEX IF NOT EXISTS pms_business_profile_types_restaurant_idx
  ON public.pms_business_profile_types(restaurant_id, name);

COMMENT ON TABLE public.pms_business_profile_types IS
  'Card 4 business profile type catalogue. Not guest profile types and not company billing.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_business_profile_types TO authenticated;
GRANT ALL ON public.pms_business_profile_types TO service_role;
ALTER TABLE public.pms_business_profile_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read business profile types" ON public.pms_business_profile_types;
CREATE POLICY "Members read business profile types" ON public.pms_business_profile_types
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert business profile types" ON public.pms_business_profile_types;
CREATE POLICY "Managers insert business profile types" ON public.pms_business_profile_types
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update business profile types" ON public.pms_business_profile_types;
CREATE POLICY "Managers update business profile types" ON public.pms_business_profile_types
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete business profile types" ON public.pms_business_profile_types;
CREATE POLICY "Managers delete business profile types" ON public.pms_business_profile_types
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_business_profile_types_updated_at ON public.pms_business_profile_types;
CREATE TRIGGER set_pms_business_profile_types_updated_at
  BEFORE UPDATE ON public.pms_business_profile_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.pms_business_profile_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  default_business_type_id uuid REFERENCES public.pms_business_profile_types(id) ON DELETE SET NULL,
  auto_approval boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE INDEX IF NOT EXISTS pms_business_profile_settings_default_idx
  ON public.pms_business_profile_settings(default_business_type_id);

COMMENT ON TABLE public.pms_business_profile_settings IS
  'Card 4 business profile settings. Configuration only; no credit accounting.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_business_profile_settings TO authenticated;
GRANT ALL ON public.pms_business_profile_settings TO service_role;
ALTER TABLE public.pms_business_profile_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read business profile settings" ON public.pms_business_profile_settings;
CREATE POLICY "Members read business profile settings" ON public.pms_business_profile_settings
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert business profile settings" ON public.pms_business_profile_settings;
CREATE POLICY "Managers insert business profile settings" ON public.pms_business_profile_settings
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update business profile settings" ON public.pms_business_profile_settings;
CREATE POLICY "Managers update business profile settings" ON public.pms_business_profile_settings
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete business profile settings" ON public.pms_business_profile_settings;
CREATE POLICY "Managers delete business profile settings" ON public.pms_business_profile_settings
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_business_profile_settings_updated_at ON public.pms_business_profile_settings;
CREATE TRIGGER set_pms_business_profile_settings_updated_at
  BEFORE UPDATE ON public.pms_business_profile_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
