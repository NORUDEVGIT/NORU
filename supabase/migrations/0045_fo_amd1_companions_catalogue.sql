-- FO-AMD1 — Named companions + service catalogue (Issue #52).
--
-- Additive only. Stay↔guest junction lives in public.fo_stay_companions.
-- Front Office extras catalogue lives in public.fo_service_catalogue.
-- Empty catalogue is intentional (free-text Add Service fallback).
--
-- Does NOT add rate-rebuild tables, FO Void, capacity-override columns,
-- Early/Late exception writers, or privileged RPCs.
-- Does NOT seed catalogue rows.
--
-- Same-property checks mirror fo_guest_requests / 0043
-- (composite FK onto hotel_reservations and guest_profiles).
--
-- IN THE PR ONLY — do not apply to live until Abel instructs after merge.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f supabase/migrations/0045_fo_amd1_companions_catalogue.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.fo_stay_companions;
--   DROP TABLE IF EXISTS public.fo_service_catalogue;

CREATE TABLE IF NOT EXISTS public.fo_stay_companions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES public.hotel_reservations(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL REFERENCES public.guest_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fo_stay_companions_reservation_guest_unique UNIQUE (reservation_id, guest_id),
  CONSTRAINT fo_stay_companions_reservation_same_property FOREIGN KEY (reservation_id, restaurant_id)
    REFERENCES public.hotel_reservations(id, restaurant_id),
  CONSTRAINT fo_stay_companions_guest_same_property FOREIGN KEY (guest_id, restaurant_id)
    REFERENCES public.guest_profiles(id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS fo_stay_companions_restaurant_idx
  ON public.fo_stay_companions (restaurant_id);
CREATE INDEX IF NOT EXISTS fo_stay_companions_reservation_idx
  ON public.fo_stay_companions (restaurant_id, reservation_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fo_stay_companions TO authenticated;
GRANT ALL ON public.fo_stay_companions TO service_role;
ALTER TABLE public.fo_stay_companions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read fo stay companions" ON public.fo_stay_companions
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers insert fo stay companions" ON public.fo_stay_companions
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers update fo stay companions" ON public.fo_stay_companions
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers delete fo stay companions" ON public.fo_stay_companions
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Front office read fo stay companions" ON public.fo_stay_companions
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
CREATE POLICY "Front office insert fo stay companions" ON public.fo_stay_companions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
CREATE POLICY "Front office update fo stay companions" ON public.fo_stay_companions
  FOR UPDATE TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
CREATE POLICY "Front office delete fo stay companions" ON public.fo_stay_companions
  FOR DELETE TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

CREATE TABLE IF NOT EXISTS public.fo_service_catalogue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  default_amount numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  CONSTRAINT fo_service_catalogue_amount_check CHECK (default_amount >= 0),
  CONSTRAINT fo_service_catalogue_name_check CHECK (char_length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS fo_service_catalogue_restaurant_name_uidx
  ON public.fo_service_catalogue (restaurant_id, lower(name));
CREATE INDEX IF NOT EXISTS fo_service_catalogue_restaurant_active_idx
  ON public.fo_service_catalogue (restaurant_id, active, sort_order, name);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fo_service_catalogue TO authenticated;
GRANT ALL ON public.fo_service_catalogue TO service_role;
ALTER TABLE public.fo_service_catalogue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read fo service catalogue" ON public.fo_service_catalogue
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers insert fo service catalogue" ON public.fo_service_catalogue
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers update fo service catalogue" ON public.fo_service_catalogue
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers delete fo service catalogue" ON public.fo_service_catalogue
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Front office read fo service catalogue" ON public.fo_service_catalogue
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
