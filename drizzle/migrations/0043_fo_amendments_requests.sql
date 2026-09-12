-- FO-FS4 — Guest requests + special request category (Issue #39).
--
-- Additive only. Stay-bound guest requests live in public.fo_guest_requests.
-- Special request category is a nullable text column on hotel_reservations
-- (first-class special_requests text already exists and must not be folded
-- into notes).
--
-- Does NOT add a companion / stay-guest junction, extras catalogue, yield
-- tables, or FO Void.
--
-- Do not apply to live until Abel instructs after merge.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0043_fo_amendments_requests.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.fo_guest_requests;
--   ALTER TABLE public.hotel_reservations DROP COLUMN IF EXISTS special_request_category;

ALTER TABLE public.hotel_reservations
  ADD COLUMN IF NOT EXISTS special_request_category text;

ALTER TABLE public.hotel_reservations
  DROP CONSTRAINT IF EXISTS hotel_reservations_special_request_category_check;
ALTER TABLE public.hotel_reservations
  ADD CONSTRAINT hotel_reservations_special_request_category_check
  CHECK (
    special_request_category IS NULL
    OR special_request_category IN ('bed', 'diet', 'accessibility', 'other')
  );

COMMENT ON COLUMN public.hotel_reservations.special_request_category IS
  'FO-FS4: bed | diet | accessibility | other. Pairs with special_requests text.';

CREATE TABLE IF NOT EXISTS public.fo_guest_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES public.hotel_reservations(id) ON DELETE CASCADE,
  request_text text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  actor_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fo_guest_requests_reservation_same_property FOREIGN KEY (reservation_id, restaurant_id)
    REFERENCES public.hotel_reservations(id, restaurant_id),
  CONSTRAINT fo_guest_requests_status_check CHECK (status IN ('open', 'done')),
  CONSTRAINT fo_guest_requests_text_check CHECK (char_length(btrim(request_text)) >= 3)
);

CREATE INDEX IF NOT EXISTS fo_guest_requests_restaurant_idx
  ON public.fo_guest_requests (restaurant_id);
CREATE INDEX IF NOT EXISTS fo_guest_requests_reservation_idx
  ON public.fo_guest_requests (restaurant_id, reservation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fo_guest_requests_open_idx
  ON public.fo_guest_requests (restaurant_id, status)
  WHERE status = 'open';

GRANT SELECT, INSERT, UPDATE ON public.fo_guest_requests TO authenticated;
GRANT ALL ON public.fo_guest_requests TO service_role;
ALTER TABLE public.fo_guest_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read fo guest requests" ON public.fo_guest_requests
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers insert fo guest requests" ON public.fo_guest_requests
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers update fo guest requests" ON public.fo_guest_requests
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Front office read fo guest requests" ON public.fo_guest_requests
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
CREATE POLICY "Front office insert fo guest requests" ON public.fo_guest_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
CREATE POLICY "Front office update fo guest requests" ON public.fo_guest_requests
  FOR UPDATE TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

CREATE TRIGGER set_fo_guest_requests_updated_at BEFORE UPDATE ON public.fo_guest_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
