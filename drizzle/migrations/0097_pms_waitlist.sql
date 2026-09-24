-- PMS Waitlist — request, offer snapshot, operational history.
-- Dual-lane: drizzle/migrations and supabase/migrations copies must match.
-- Not hotel_reservations.pending. Conversion links reservation_id after createReservation.

CREATE TABLE IF NOT EXISTS public.pms_waitlist_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  confirmation_number text NOT NULL,
  guest_id uuid NOT NULL,
  arrival_date date NOT NULL,
  departure_date date NOT NULL,
  adults integer NOT NULL DEFAULT 1,
  children integer NOT NULL DEFAULT 0,
  requested_room_type_id uuid,
  alternate_room_type_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  flexible_dates boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 3,
  status text NOT NULL DEFAULT 'open',
  notes text,
  reservation_id uuid,
  created_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_waitlist_requests_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_waitlist_requests_confirmation_unique UNIQUE (restaurant_id, confirmation_number),
  CONSTRAINT pms_waitlist_requests_dates_check CHECK (departure_date > arrival_date),
  CONSTRAINT pms_waitlist_requests_occupancy_check CHECK (adults >= 1 AND children >= 0),
  CONSTRAINT pms_waitlist_requests_priority_check CHECK (priority BETWEEN 1 AND 5),
  CONSTRAINT pms_waitlist_requests_status_check CHECK (
    status IN ('open', 'offered', 'accepted', 'converted', 'cancelled')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pms_waitlist_requests_reservation_unique
  ON public.pms_waitlist_requests (restaurant_id, reservation_id)
  WHERE reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pms_waitlist_requests_restaurant_dates_idx
  ON public.pms_waitlist_requests (restaurant_id, arrival_date, status);

COMMENT ON TABLE public.pms_waitlist_requests IS
  'Hotel waitlist request. Not a reservation stay and not F&B table waitlist.';

ALTER TABLE public.pms_waitlist_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read pms waitlist requests" ON public.pms_waitlist_requests;
CREATE POLICY "Managers read pms waitlist requests" ON public.pms_waitlist_requests
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );
DROP POLICY IF EXISTS "Managers write pms waitlist requests" ON public.pms_waitlist_requests;
CREATE POLICY "Managers write pms waitlist requests" ON public.pms_waitlist_requests
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

GRANT SELECT, INSERT, UPDATE ON public.pms_waitlist_requests TO authenticated;
GRANT ALL ON public.pms_waitlist_requests TO service_role;

DROP TRIGGER IF EXISTS set_pms_waitlist_requests_updated_at ON public.pms_waitlist_requests;
CREATE TRIGGER set_pms_waitlist_requests_updated_at
  BEFORE UPDATE ON public.pms_waitlist_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pms_waitlist_requests
  DROP CONSTRAINT IF EXISTS pms_waitlist_requests_guest_same_property;
ALTER TABLE public.pms_waitlist_requests
  ADD CONSTRAINT pms_waitlist_requests_guest_same_property
  FOREIGN KEY (guest_id, restaurant_id)
  REFERENCES public.guest_profiles(id, restaurant_id);

ALTER TABLE public.pms_waitlist_requests
  DROP CONSTRAINT IF EXISTS pms_waitlist_requests_room_type_same_property;
ALTER TABLE public.pms_waitlist_requests
  ADD CONSTRAINT pms_waitlist_requests_room_type_same_property
  FOREIGN KEY (requested_room_type_id, restaurant_id)
  REFERENCES public.room_types(id, restaurant_id);

ALTER TABLE public.pms_waitlist_requests
  DROP CONSTRAINT IF EXISTS pms_waitlist_requests_reservation_fk;
ALTER TABLE public.pms_waitlist_requests
  ADD CONSTRAINT pms_waitlist_requests_reservation_fk
  FOREIGN KEY (reservation_id)
  REFERENCES public.hotel_reservations(id);

CREATE TABLE IF NOT EXISTS public.pms_waitlist_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  waitlist_request_id uuid NOT NULL,
  arrival_date date NOT NULL,
  departure_date date NOT NULL,
  room_type_id uuid NOT NULL,
  rate_plan_id uuid,
  quoted_total numeric(12, 2),
  quoted_currency text,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_waitlist_offers_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_waitlist_offers_dates_check CHECK (departure_date > arrival_date),
  CONSTRAINT pms_waitlist_offers_status_check CHECK (
    status IN ('pending', 'accepted', 'declined', 'cancelled')
  ),
  CONSTRAINT pms_waitlist_offers_request_same_property
    FOREIGN KEY (waitlist_request_id, restaurant_id)
    REFERENCES public.pms_waitlist_requests(id, restaurant_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS pms_waitlist_offers_request_idx
  ON public.pms_waitlist_offers (restaurant_id, waitlist_request_id, status);

COMMENT ON TABLE public.pms_waitlist_offers IS
  'Persisted waitlist offer snapshot. Matches are derived from inventory until an offer is created.';

ALTER TABLE public.pms_waitlist_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read pms waitlist offers" ON public.pms_waitlist_offers;
CREATE POLICY "Managers read pms waitlist offers" ON public.pms_waitlist_offers
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );
DROP POLICY IF EXISTS "Managers write pms waitlist offers" ON public.pms_waitlist_offers;
CREATE POLICY "Managers write pms waitlist offers" ON public.pms_waitlist_offers
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

GRANT SELECT, INSERT, UPDATE ON public.pms_waitlist_offers TO authenticated;
GRANT ALL ON public.pms_waitlist_offers TO service_role;

DROP TRIGGER IF EXISTS set_pms_waitlist_offers_updated_at ON public.pms_waitlist_offers;
CREATE TRIGGER set_pms_waitlist_offers_updated_at
  BEFORE UPDATE ON public.pms_waitlist_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pms_waitlist_offers
  DROP CONSTRAINT IF EXISTS pms_waitlist_offers_room_type_same_property;
ALTER TABLE public.pms_waitlist_offers
  ADD CONSTRAINT pms_waitlist_offers_room_type_same_property
  FOREIGN KEY (room_type_id, restaurant_id)
  REFERENCES public.room_types(id, restaurant_id);

CREATE TABLE IF NOT EXISTS public.pms_waitlist_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  waitlist_request_id uuid NOT NULL,
  event_type text NOT NULL,
  previous_values jsonb,
  new_values jsonb,
  notes text,
  actor_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_waitlist_history_request_same_property
    FOREIGN KEY (waitlist_request_id, restaurant_id)
    REFERENCES public.pms_waitlist_requests(id, restaurant_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS pms_waitlist_history_request_idx
  ON public.pms_waitlist_history (restaurant_id, waitlist_request_id, created_at DESC);

COMMENT ON TABLE public.pms_waitlist_history IS
  'Operational waitlist event log. Not the Security & Audit card.';

ALTER TABLE public.pms_waitlist_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read waitlist history" ON public.pms_waitlist_history;
CREATE POLICY "Managers read waitlist history" ON public.pms_waitlist_history
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );
DROP POLICY IF EXISTS "Managers insert waitlist history" ON public.pms_waitlist_history;
CREATE POLICY "Managers insert waitlist history" ON public.pms_waitlist_history
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

GRANT SELECT, INSERT ON public.pms_waitlist_history TO authenticated;
GRANT ALL ON public.pms_waitlist_history TO service_role;
