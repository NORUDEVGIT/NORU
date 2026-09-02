-- Guest identity foundation (Phase 6C). Tenant-scoped, owner/manager only.

CREATE OR REPLACE FUNCTION public.normalize_guest_contact()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.email := NULLIF(btrim(COALESCE(NEW.email, '')), '');
  NEW.phone := NULLIF(btrim(COALESCE(NEW.phone, '')), '');
  NEW.email_normalized := lower(NEW.email);
  NEW.phone_normalized := NULLIF(regexp_replace(COALESCE(NEW.phone, ''), '[^0-9]', '', 'g'), '');
  RETURN NEW;
END;
$$;

CREATE TABLE public.guest_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text,
  phone text,
  email text,
  email_normalized text,
  phone_normalized text,
  nationality text,
  language text,
  date_of_birth date,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  country text,
  postal_code text,
  guest_status text NOT NULL DEFAULT 'active',
  vip_status boolean NOT NULL DEFAULT false,
  notes text,
  linked_customer_user_id uuid,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_profiles_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT guest_profiles_first_name_check CHECK (btrim(first_name) <> ''),
  CONSTRAINT guest_profiles_status_check CHECK (guest_status IN ('active','inactive'))
);

CREATE INDEX guest_profiles_restaurant_idx ON public.guest_profiles(restaurant_id);
CREATE INDEX guest_profiles_email_idx ON public.guest_profiles(restaurant_id, email_normalized);
CREATE INDEX guest_profiles_phone_idx ON public.guest_profiles(restaurant_id, phone_normalized);

GRANT SELECT, INSERT, UPDATE ON public.guest_profiles TO authenticated;
GRANT ALL ON public.guest_profiles TO service_role;
ALTER TABLE public.guest_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read guests" ON public.guest_profiles
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers insert guests" ON public.guest_profiles
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers update guests" ON public.guest_profiles
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TRIGGER normalize_guest_contact_ins BEFORE INSERT ON public.guest_profiles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_guest_contact();
CREATE TRIGGER normalize_guest_contact_upd BEFORE UPDATE ON public.guest_profiles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_guest_contact();
CREATE TRIGGER set_guest_profiles_updated_at BEFORE UPDATE ON public.guest_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Preferences: one row per guest
CREATE TABLE public.guest_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL,
  room_preference text,
  bed_preference text,
  floor_preference text,
  view_preference text,
  food_preference text,
  communication_preference text,
  accessibility_requirements text,
  special_requests text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_preferences_guest_unique UNIQUE (guest_id),
  CONSTRAINT guest_preferences_same_property FOREIGN KEY (guest_id, restaurant_id)
    REFERENCES public.guest_profiles(id, restaurant_id) ON DELETE CASCADE
);

CREATE INDEX guest_preferences_restaurant_idx ON public.guest_preferences(restaurant_id);

GRANT SELECT, INSERT, UPDATE ON public.guest_preferences TO authenticated;
GRANT ALL ON public.guest_preferences TO service_role;
ALTER TABLE public.guest_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read guest preferences" ON public.guest_preferences
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers insert guest preferences" ON public.guest_preferences
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers update guest preferences" ON public.guest_preferences
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TRIGGER set_guest_preferences_updated_at BEFORE UPDATE ON public.guest_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Immutable guest profile history
CREATE TABLE public.guest_profile_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL,
  event_type text NOT NULL,
  previous_values jsonb,
  new_values jsonb,
  notes text,
  actor_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_profile_history_same_property FOREIGN KEY (guest_id, restaurant_id)
    REFERENCES public.guest_profiles(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT guest_profile_history_event_check CHECK (
    event_type IN ('created','profile_updated','vip_changed','status_changed','preference_updated','note_added')
  )
);

CREATE INDEX guest_profile_history_guest_idx ON public.guest_profile_history(guest_id, created_at DESC);

GRANT SELECT ON public.guest_profile_history TO authenticated;
GRANT ALL ON public.guest_profile_history TO service_role;
ALTER TABLE public.guest_profile_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read guest history" ON public.guest_profile_history
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
