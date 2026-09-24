-- Guest Preferences workspace — Settings-driven values stay on
-- guest_preference_values. Apply-to-future flag stays on guest_preferences.
-- Dual-lane with drizzle/migrations/0088_pms_guest_preferences_workspace.sql.
-- No second preference catalogue. No SECURITY DEFINER.

ALTER TABLE public.pms_guest_preference_types
  DROP CONSTRAINT IF EXISTS pms_guest_pref_types_value_type_check;
ALTER TABLE public.pms_guest_preference_types
  ADD CONSTRAINT pms_guest_pref_types_value_type_check CHECK (
    value_type IN ('single', 'multi', 'yes_no', 'text', 'number')
  );

ALTER TABLE public.guest_preferences
  ADD COLUMN IF NOT EXISTS apply_to_future_reservations boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.guest_preferences.apply_to_future_reservations IS
  'When true, new reservations may prefill defaults from this guest preferences. Not a hard allocation constraint.';

DROP POLICY IF EXISTS "Front office insert guest preferences" ON public.guest_preferences;
CREATE POLICY "Front office insert guest preferences" ON public.guest_preferences
  FOR INSERT TO authenticated WITH CHECK (
    public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist'])
  );
DROP POLICY IF EXISTS "Front office update guest preferences" ON public.guest_preferences;
CREATE POLICY "Front office update guest preferences" ON public.guest_preferences
  FOR UPDATE TO authenticated USING (
    public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist'])
  ) WITH CHECK (
    public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist'])
  );
