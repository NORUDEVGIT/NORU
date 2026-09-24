-- Guest Profile Overview — identity, preference values, and service history.
-- Sequential after 0085. Dual-lane copies live in
--   supabase/migrations/0086_pms_guest_overview.sql
--   drizzle/migrations/0086_pms_guest_overview.sql
--
-- Additive only. Does not invent revenue, loyalty points, tags, or a second
-- guest store. Card 4 catalogues stay configuration; operational values live here.
--
-- IN THE PR ONLY — do not apply to production from an agent.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.next_guest_profile_number(uuid);
--   DROP TABLE IF EXISTS public.guest_service_history;
--   DROP TABLE IF EXISTS public.guest_preference_values;
--   DROP TABLE IF EXISTS public.guest_profile_counters;
--   ALTER TABLE public.guest_profiles
--     DROP COLUMN IF EXISTS profile_number,
--     DROP COLUMN IF EXISTS profile_type_id,
--     DROP COLUMN IF EXISTS photo_storage_path,
--     DROP COLUMN IF EXISTS preferred_contact_method,
--     DROP COLUMN IF EXISTS preferred_contact_time,
--     DROP COLUMN IF EXISTS geo_latitude,
--     DROP COLUMN IF EXISTS geo_longitude;

ALTER TABLE public.pms_guest_profile_types
  ADD CONSTRAINT pms_guest_profile_types_id_restaurant_unique UNIQUE (id, restaurant_id);

ALTER TABLE public.pms_guest_preference_types
  ADD CONSTRAINT pms_guest_pref_types_id_restaurant_unique UNIQUE (id, restaurant_id);

CREATE TABLE IF NOT EXISTS public.guest_profile_counters (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  last_number bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.guest_profile_counters TO authenticated;
GRANT ALL ON public.guest_profile_counters TO service_role;
ALTER TABLE public.guest_profile_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read guest profile counters" ON public.guest_profile_counters;
CREATE POLICY "Managers read guest profile counters" ON public.guest_profile_counters
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

ALTER TABLE public.guest_profiles
  ADD COLUMN IF NOT EXISTS profile_number text,
  ADD COLUMN IF NOT EXISTS profile_type_id uuid,
  ADD COLUMN IF NOT EXISTS photo_storage_path text,
  ADD COLUMN IF NOT EXISTS preferred_contact_method text,
  ADD COLUMN IF NOT EXISTS preferred_contact_time text,
  ADD COLUMN IF NOT EXISTS geo_latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS geo_longitude numeric(9,6);

ALTER TABLE public.guest_profiles
  DROP CONSTRAINT IF EXISTS guest_profiles_profile_number_unique;
ALTER TABLE public.guest_profiles
  ADD CONSTRAINT guest_profiles_profile_number_unique UNIQUE (restaurant_id, profile_number);

ALTER TABLE public.guest_profiles
  DROP CONSTRAINT IF EXISTS guest_profiles_profile_type_fk;
ALTER TABLE public.guest_profiles
  ADD CONSTRAINT guest_profiles_profile_type_fk
  FOREIGN KEY (profile_type_id, restaurant_id)
  REFERENCES public.pms_guest_profile_types (id, restaurant_id)
  ON DELETE RESTRICT;

ALTER TABLE public.guest_profiles
  DROP CONSTRAINT IF EXISTS guest_profiles_geo_latitude_check;
ALTER TABLE public.guest_profiles
  ADD CONSTRAINT guest_profiles_geo_latitude_check
  CHECK (geo_latitude IS NULL OR (geo_latitude >= -90 AND geo_latitude <= 90));

ALTER TABLE public.guest_profiles
  DROP CONSTRAINT IF EXISTS guest_profiles_geo_longitude_check;
ALTER TABLE public.guest_profiles
  ADD CONSTRAINT guest_profiles_geo_longitude_check
  CHECK (geo_longitude IS NULL OR (geo_longitude >= -180 AND geo_longitude <= 180));

COMMENT ON COLUMN public.guest_profiles.profile_number IS
  'Persisted property-scoped display id. Not a UUID prefix.';
COMMENT ON COLUMN public.guest_profiles.profile_type_id IS
  'Optional FK to Card 4 pms_guest_profile_types. Inactive types do not hide the guest.';
COMMENT ON COLUMN public.guest_profiles.photo_storage_path IS
  'Avatar object in property-images. Distinct from guest_documents identity files.';

CREATE OR REPLACE FUNCTION public.next_guest_profile_number(_restaurant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_number bigint;
BEGIN
  INSERT INTO public.guest_profile_counters (restaurant_id, last_number, updated_at)
  VALUES (_restaurant_id, 1, now())
  ON CONFLICT (restaurant_id) DO UPDATE
    SET last_number = public.guest_profile_counters.last_number + 1,
        updated_at = now()
  RETURNING last_number INTO next_number;
  RETURN 'IND-' || lpad(next_number::text, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_guest_profile_number(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_guest_profile_number(uuid) TO service_role;

WITH numbered AS (
  SELECT
    id,
    restaurant_id,
    row_number() OVER (PARTITION BY restaurant_id ORDER BY created_at, id) AS n
  FROM public.guest_profiles
  WHERE profile_number IS NULL
)
UPDATE public.guest_profiles g
SET profile_number = 'IND-' || lpad(numbered.n::text, 6, '0')
FROM numbered
WHERE g.id = numbered.id;

INSERT INTO public.guest_profile_counters (restaurant_id, last_number, updated_at)
SELECT restaurant_id, count(*)::bigint, now()
FROM public.guest_profiles
GROUP BY restaurant_id
ON CONFLICT (restaurant_id) DO UPDATE
  SET last_number = GREATEST(public.guest_profile_counters.last_number, EXCLUDED.last_number),
      updated_at = now();

UPDATE public.guest_profiles g
SET profile_type_id = t.id
FROM public.pms_guest_profile_types t
WHERE t.restaurant_id = g.restaurant_id
  AND t.code = 'IND'
  AND g.profile_type_id IS NULL;

CREATE TABLE IF NOT EXISTS public.guest_preference_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL,
  preference_type_id uuid NOT NULL,
  value_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_preference_values_guest_fk
    FOREIGN KEY (guest_id, restaurant_id)
    REFERENCES public.guest_profiles (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT guest_preference_values_type_fk
    FOREIGN KEY (preference_type_id, restaurant_id)
    REFERENCES public.pms_guest_preference_types (id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT guest_preference_values_unique UNIQUE (guest_id, preference_type_id),
  CONSTRAINT guest_preference_values_json_array CHECK (jsonb_typeof(value_json) = 'array')
);

CREATE INDEX IF NOT EXISTS guest_preference_values_guest_idx
  ON public.guest_preference_values (restaurant_id, guest_id);

COMMENT ON TABLE public.guest_preference_values IS
  'Operational guest answers for Card 4 preference types. Not a third catalogue.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_preference_values TO authenticated;
GRANT ALL ON public.guest_preference_values TO service_role;
ALTER TABLE public.guest_preference_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read guest preference values" ON public.guest_preference_values;
CREATE POLICY "Managers read guest preference values" ON public.guest_preference_values
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers write guest preference values" ON public.guest_preference_values;
CREATE POLICY "Managers insert guest preference values" ON public.guest_preference_values
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update guest preference values" ON public.guest_preference_values;
CREATE POLICY "Managers update guest preference values" ON public.guest_preference_values
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete guest preference values" ON public.guest_preference_values;
CREATE POLICY "Managers delete guest preference values" ON public.guest_preference_values
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Front office read guest preference values" ON public.guest_preference_values;
CREATE POLICY "Front office read guest preference values" ON public.guest_preference_values
  FOR SELECT TO authenticated USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
DROP POLICY IF EXISTS "Front office insert guest preference values" ON public.guest_preference_values;
CREATE POLICY "Front office insert guest preference values" ON public.guest_preference_values
  FOR INSERT TO authenticated WITH CHECK (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
DROP POLICY IF EXISTS "Front office update guest preference values" ON public.guest_preference_values;
CREATE POLICY "Front office update guest preference values" ON public.guest_preference_values
  FOR UPDATE TO authenticated USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
DROP POLICY IF EXISTS "Front office delete guest preference values" ON public.guest_preference_values;
CREATE POLICY "Front office delete guest preference values" ON public.guest_preference_values
  FOR DELETE TO authenticated USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

DROP TRIGGER IF EXISTS set_guest_preference_values_updated_at ON public.guest_preference_values;
CREATE TRIGGER set_guest_preference_values_updated_at
  BEFORE UPDATE ON public.guest_preference_values
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.guest_service_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL,
  reservation_id uuid,
  service_type_id uuid NOT NULL,
  status text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  amount numeric(12,2),
  currency text,
  notes text,
  created_by_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_service_history_guest_fk
    FOREIGN KEY (guest_id, restaurant_id)
    REFERENCES public.guest_profiles (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT guest_service_history_reservation_fk
    FOREIGN KEY (reservation_id, restaurant_id)
    REFERENCES public.hotel_reservations (id, restaurant_id)
    ON DELETE SET NULL,
  CONSTRAINT guest_service_history_type_fk
    FOREIGN KEY (service_type_id, restaurant_id)
    REFERENCES public.pms_guest_service_types (id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT guest_service_history_status_check CHECK (
    status IN ('requested', 'in_progress', 'completed', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS guest_service_history_guest_idx
  ON public.guest_service_history (restaurant_id, guest_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS guest_service_history_reservation_idx
  ON public.guest_service_history (restaurant_id, reservation_id);

COMMENT ON TABLE public.guest_service_history IS
  'Operational guest service records typed from Card 4 pms_guest_service_types. Not the GST catalogue.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_service_history TO authenticated;
GRANT ALL ON public.guest_service_history TO service_role;
ALTER TABLE public.guest_service_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read guest service history" ON public.guest_service_history;
CREATE POLICY "Managers read guest service history" ON public.guest_service_history
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers insert guest service history" ON public.guest_service_history;
CREATE POLICY "Managers insert guest service history" ON public.guest_service_history
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update guest service history" ON public.guest_service_history;
CREATE POLICY "Managers update guest service history" ON public.guest_service_history
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Front office read guest service history" ON public.guest_service_history;
CREATE POLICY "Front office read guest service history" ON public.guest_service_history
  FOR SELECT TO authenticated USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
DROP POLICY IF EXISTS "Front office insert guest service history" ON public.guest_service_history;
CREATE POLICY "Front office insert guest service history" ON public.guest_service_history
  FOR INSERT TO authenticated WITH CHECK (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
DROP POLICY IF EXISTS "Front office update guest service history" ON public.guest_service_history;
CREATE POLICY "Front office update guest service history" ON public.guest_service_history
  FOR UPDATE TO authenticated USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

DROP TRIGGER IF EXISTS set_guest_service_history_updated_at ON public.guest_service_history;
CREATE TRIGGER set_guest_service_history_updated_at
  BEFORE UPDATE ON public.guest_service_history
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.guest_profile_history
  DROP CONSTRAINT IF EXISTS guest_profile_history_event_check;
ALTER TABLE public.guest_profile_history
  ADD CONSTRAINT guest_profile_history_event_check CHECK (
    event_type IN (
      'created',
      'profile_updated',
      'vip_changed',
      'status_changed',
      'preference_updated',
      'note_added',
      'document_uploaded',
      'document_verified',
      'document_rejected',
      'merged_from',
      'merged_into',
      'consent_updated',
      'relationship_linked',
      'relationship_unlinked',
      'comms_logged',
      'comms_sent',
      'exported',
      'anonymised',
      'unmerged',
      'unmerge_blocked',
      'restriction_set',
      'restriction_cleared',
      'restriction_lifted',
      'photo_updated'
    )
  );
