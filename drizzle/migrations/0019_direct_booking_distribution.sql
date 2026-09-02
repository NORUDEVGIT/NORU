-- Phase 6J — Direct booking engine + distribution foundation

-- 1. Reservation source now includes public direct bookings
ALTER TABLE public.hotel_reservations DROP CONSTRAINT IF EXISTS hotel_reservations_source_check;
ALTER TABLE public.hotel_reservations ADD CONSTRAINT hotel_reservations_source_check
  CHECK (source IN ('staff','walk_in','direct_booking','future_online'));

-- 2. Direct booking settings on the property (all additive / defaulted)
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS direct_booking_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_contact_email text,
  ADD COLUMN IF NOT EXISTS booking_contact_phone text,
  ADD COLUMN IF NOT EXISTS booking_message text;

-- 3. Distribution channels
CREATE TABLE public.distribution_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  channel_type text NOT NULL DEFAULT 'direct',
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'not_connected',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_channels_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT distribution_channels_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT distribution_channels_type_check CHECK (channel_type IN ('direct','ota')),
  CONSTRAINT distribution_channels_status_check CHECK (status IN ('active','inactive','not_connected'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distribution_channels TO authenticated;
GRANT ALL ON public.distribution_channels TO service_role;
ALTER TABLE public.distribution_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read channels" ON public.distribution_channels
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers write channels" ON public.distribution_channels
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TRIGGER set_distribution_channels_updated_at BEFORE UPDATE ON public.distribution_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Room type mappings
CREATE TABLE public.distribution_room_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  external_room_code text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_room_mappings_unique UNIQUE (channel_id, room_type_id),
  CONSTRAINT distribution_room_mappings_channel_fk FOREIGN KEY (channel_id, restaurant_id)
    REFERENCES public.distribution_channels(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT distribution_room_mappings_type_fk FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types(id, restaurant_id) ON DELETE CASCADE
);

CREATE INDEX distribution_room_mappings_channel_idx ON public.distribution_room_mappings(channel_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distribution_room_mappings TO authenticated;
GRANT ALL ON public.distribution_room_mappings TO service_role;
ALTER TABLE public.distribution_room_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read room mappings" ON public.distribution_room_mappings
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers write room mappings" ON public.distribution_room_mappings
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TRIGGER set_distribution_room_mappings_updated_at BEFORE UPDATE ON public.distribution_room_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Rate plan mappings
CREATE TABLE public.distribution_rate_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL,
  rate_plan_id uuid NOT NULL,
  external_rate_code text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_rate_mappings_unique UNIQUE (channel_id, rate_plan_id),
  CONSTRAINT distribution_rate_mappings_channel_fk FOREIGN KEY (channel_id, restaurant_id)
    REFERENCES public.distribution_channels(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT distribution_rate_mappings_plan_fk FOREIGN KEY (rate_plan_id, restaurant_id)
    REFERENCES public.hotel_rate_plans(id, restaurant_id) ON DELETE CASCADE
);

CREATE INDEX distribution_rate_mappings_channel_idx ON public.distribution_rate_mappings(channel_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distribution_rate_mappings TO authenticated;
GRANT ALL ON public.distribution_rate_mappings TO service_role;
ALTER TABLE public.distribution_rate_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read rate mappings" ON public.distribution_rate_mappings
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers write rate mappings" ON public.distribution_rate_mappings
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TRIGGER set_distribution_rate_mappings_updated_at BEFORE UPDATE ON public.distribution_rate_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Immutable distribution log (no update/delete policy on purpose)
CREATE TABLE public.distribution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  channel_id uuid,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  message text,
  reference_type text,
  reference_id uuid,
  payload_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_logs_status_check CHECK (status IN ('success','failed','info')),
  CONSTRAINT distribution_logs_channel_fk FOREIGN KEY (channel_id, restaurant_id)
    REFERENCES public.distribution_channels(id, restaurant_id) ON DELETE SET NULL
);

CREATE INDEX distribution_logs_restaurant_idx ON public.distribution_logs(restaurant_id, created_at DESC);

GRANT SELECT ON public.distribution_logs TO authenticated;
GRANT ALL ON public.distribution_logs TO service_role;
ALTER TABLE public.distribution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read distribution logs" ON public.distribution_logs
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

-- 7. Public direct booking creation: same locked pipeline, no staff actor
CREATE OR REPLACE FUNCTION public.create_direct_booking(
  _restaurant_id uuid,
  _guest_id uuid,
  _room_type_id uuid,
  _arrival date,
  _departure date,
  _adults integer,
  _children integer,
  _special_requests text,
  _rate_plan_id uuid
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created public.hotel_reservations;
BEGIN
  created := public.create_hotel_reservation_priced(
    _restaurant_id, _guest_id, _room_type_id, NULL,
    _arrival, _departure, _adults, _children,
    _special_requests, NULL, 'confirmed', _rate_plan_id, NULL
  );

  UPDATE public.hotel_reservations
  SET source = 'direct_booking'
  WHERE id = created.id AND restaurant_id = _restaurant_id
  RETURNING * INTO created;

  RETURN created;
END;
$$;

REVOKE ALL ON FUNCTION public.create_direct_booking(uuid, uuid, uuid, date, date, integer, integer, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_direct_booking(uuid, uuid, uuid, date, date, integer, integer, text, uuid) TO service_role;

-- 8. Seed the direct channel for every existing property
INSERT INTO public.distribution_channels (restaurant_id, channel_type, code, name, status)
SELECT r.id, 'direct', 'DIRECT', 'NORU Direct Booking', 'active'
FROM public.restaurants r
ON CONFLICT (restaurant_id, code) DO NOTHING;
