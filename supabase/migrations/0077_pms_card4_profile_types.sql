-- PMS Property Setup Card 4 — Guest & Services, Phase 1: Profile Types.
-- Sequential after 0076. Dual-lane copies live in
--   supabase/migrations/0077_pms_card4_profile_types.sql
--   drizzle/migrations/0077_pms_card4_profile_types.sql
--
-- Catalogue only. Does not alter guest_profiles or operational account types.
-- Deleting a profile type must not delete guest operational records.

CREATE TABLE IF NOT EXISTS public.pms_guest_profile_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  description text,
  icon text NOT NULL DEFAULT 'user',
  active boolean NOT NULL DEFAULT true,
  required_field_ids text[] NOT NULL DEFAULT '{}',
  document_type_ids uuid[] NOT NULL DEFAULT '{}',
  preference_type_ids text[] NOT NULL DEFAULT '{}',
  defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pms_guest_profile_types_name_unique UNIQUE (restaurant_id, name),
  CONSTRAINT pms_guest_profile_types_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_guest_profile_types_code_format CHECK (code = upper(code) AND code ~ '^[A-Z][A-Z0-9]{1,11}$'),
  CONSTRAINT pms_guest_profile_types_defaults_object CHECK (jsonb_typeof(defaults) = 'object')
);

CREATE INDEX IF NOT EXISTS pms_guest_profile_types_restaurant_idx
  ON public.pms_guest_profile_types(restaurant_id);

COMMENT ON TABLE public.pms_guest_profile_types IS
  'Card 4 Profile Types catalogue. Not the operational Guest Profile type switcher.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_guest_profile_types TO authenticated;
GRANT ALL ON public.pms_guest_profile_types TO service_role;
ALTER TABLE public.pms_guest_profile_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read profile types" ON public.pms_guest_profile_types;
CREATE POLICY "Members read profile types" ON public.pms_guest_profile_types
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert profile types" ON public.pms_guest_profile_types;
CREATE POLICY "Managers insert profile types" ON public.pms_guest_profile_types
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update profile types" ON public.pms_guest_profile_types;
CREATE POLICY "Managers update profile types" ON public.pms_guest_profile_types
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete profile types" ON public.pms_guest_profile_types;
CREATE POLICY "Managers delete profile types" ON public.pms_guest_profile_types
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_guest_profile_types_updated_at ON public.pms_guest_profile_types;
CREATE TRIGGER set_pms_guest_profile_types_updated_at
  BEFORE UPDATE ON public.pms_guest_profile_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
