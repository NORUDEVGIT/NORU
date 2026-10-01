-- PMS Property Setup Card 4 — Generic Guest Custom Field Values Persistence.
-- Sequential after 0116. Dual-lane copies live in
--   supabase/migrations/0117_pms_guest_dynamic_fields.sql
--   drizzle/migrations/0117_pms_guest_dynamic_fields.sql
--
-- Operational generic custom field values store for pms_guest_fields.
-- Core guest attributes remain on guest_profiles.
-- Identity documents remain on guest_documents.
-- Account relationships remain on guest_account_links.

-- 1. Ensure composite unique constraint on pms_guest_fields for tenant-safe FK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pms_guest_fields_id_restaurant_unique'
  ) THEN
    ALTER TABLE public.pms_guest_fields
      ADD CONSTRAINT pms_guest_fields_id_restaurant_unique UNIQUE (id, restaurant_id);
  END IF;
END $$;

-- 2. Create guest_custom_field_values table
CREATE TABLE IF NOT EXISTS public.guest_custom_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL,
  field_id uuid NOT NULL,
  value_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT guest_custom_field_values_guest_fk
    FOREIGN KEY (guest_id, restaurant_id)
    REFERENCES public.guest_profiles(id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT guest_custom_field_values_field_fk
    FOREIGN KEY (field_id, restaurant_id)
    REFERENCES public.pms_guest_fields(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT guest_custom_field_values_unique UNIQUE (guest_id, field_id)
);

CREATE INDEX IF NOT EXISTS guest_custom_field_values_guest_idx
  ON public.guest_custom_field_values (restaurant_id, guest_id);

CREATE INDEX IF NOT EXISTS guest_custom_field_values_field_idx
  ON public.guest_custom_field_values (restaurant_id, field_id);

COMMENT ON TABLE public.guest_custom_field_values IS
  'Generic operational values for custom fields defined in pms_guest_fields. Does not duplicate core guest_profiles attributes.';

-- 3. Grants and RLS matching guest_profiles operational write/read access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_custom_field_values TO authenticated;
GRANT ALL ON public.guest_custom_field_values TO service_role;
ALTER TABLE public.guest_custom_field_values ENABLE ROW LEVEL SECURITY;

-- Front office & cashier read (matching guest_profiles)
DROP POLICY IF EXISTS "Front office read custom field values" ON public.guest_custom_field_values;
CREATE POLICY "Front office read custom field values" ON public.guest_custom_field_values
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist', 'cashier']));

-- Front office insert & update (matching guest_profiles)
DROP POLICY IF EXISTS "Front office insert custom field values" ON public.guest_custom_field_values;
CREATE POLICY "Front office insert custom field values" ON public.guest_custom_field_values
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

DROP POLICY IF EXISTS "Front office update custom field values" ON public.guest_custom_field_values;
CREATE POLICY "Front office update custom field values" ON public.guest_custom_field_values
  FOR UPDATE TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']))
  WITH CHECK (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

-- Managers read, insert, update, delete (matching guest_profiles)
DROP POLICY IF EXISTS "Managers read custom field values" ON public.guest_custom_field_values;
CREATE POLICY "Managers read custom field values" ON public.guest_custom_field_values
  FOR SELECT TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

DROP POLICY IF EXISTS "Managers insert custom field values" ON public.guest_custom_field_values;
CREATE POLICY "Managers insert custom field values" ON public.guest_custom_field_values
  FOR INSERT TO authenticated
  WITH CHECK (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

DROP POLICY IF EXISTS "Managers update custom field values" ON public.guest_custom_field_values;
CREATE POLICY "Managers update custom field values" ON public.guest_custom_field_values
  FOR UPDATE TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'))
  WITH CHECK (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

DROP POLICY IF EXISTS "Managers delete custom field values" ON public.guest_custom_field_values;
CREATE POLICY "Managers delete custom field values" ON public.guest_custom_field_values
  FOR DELETE TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

-- 4. Updated_at trigger
DROP TRIGGER IF EXISTS set_guest_custom_field_values_updated_at ON public.guest_custom_field_values;
CREATE TRIGGER set_guest_custom_field_values_updated_at
  BEFORE UPDATE ON public.guest_custom_field_values
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
