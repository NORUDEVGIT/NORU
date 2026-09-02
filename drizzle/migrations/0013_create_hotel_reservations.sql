-- Phase 6D — Reservation core. Tenant-scoped, owner/manager only.

ALTER TABLE public.hotel_rooms
  ADD CONSTRAINT hotel_rooms_id_restaurant_unique UNIQUE (id, restaurant_id);
ALTER TABLE public.hotel_rooms
  ADD CONSTRAINT hotel_rooms_id_restaurant_type_unique UNIQUE (id, restaurant_id, room_type_id);

CREATE TABLE public.hotel_reservation_counters (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  last_number bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.hotel_reservation_counters TO authenticated;
GRANT ALL ON public.hotel_reservation_counters TO service_role;
ALTER TABLE public.hotel_reservation_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read reservation counters" ON public.hotel_reservation_counters
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TABLE public.hotel_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL,
  confirmation_number text NOT NULL,
  arrival_date date NOT NULL,
  departure_date date NOT NULL,
  adults integer NOT NULL DEFAULT 1,
  children integer NOT NULL DEFAULT 0,
  room_type_id uuid NOT NULL,
  room_id uuid,
  status text NOT NULL DEFAULT 'pending',
  source text NOT NULL DEFAULT 'staff',
  special_requests text,
  notes text,
  cancellation_reason text,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_reservations_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_reservations_confirmation_unique UNIQUE (restaurant_id, confirmation_number),
  CONSTRAINT hotel_reservations_dates_check CHECK (departure_date > arrival_date),
  CONSTRAINT hotel_reservations_occupancy_check CHECK (adults >= 1 AND children >= 0),
  CONSTRAINT hotel_reservations_status_check CHECK (status IN ('pending','confirmed','cancelled')),
  CONSTRAINT hotel_reservations_source_check CHECK (source IN ('staff','future_online')),
  CONSTRAINT hotel_reservations_guest_same_property FOREIGN KEY (guest_id, restaurant_id)
    REFERENCES public.guest_profiles(id, restaurant_id),
  CONSTRAINT hotel_reservations_type_same_property FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types(id, restaurant_id),
  CONSTRAINT hotel_reservations_room_same_type FOREIGN KEY (room_id, restaurant_id, room_type_id)
    REFERENCES public.hotel_rooms(id, restaurant_id, room_type_id)
);

CREATE INDEX hotel_reservations_arrival_idx ON public.hotel_reservations(restaurant_id, arrival_date);
CREATE INDEX hotel_reservations_departure_idx ON public.hotel_reservations(restaurant_id, departure_date);
CREATE INDEX hotel_reservations_status_idx ON public.hotel_reservations(restaurant_id, status);
CREATE INDEX hotel_reservations_type_idx ON public.hotel_reservations(restaurant_id, room_type_id, arrival_date);
CREATE INDEX hotel_reservations_room_idx ON public.hotel_reservations(restaurant_id, room_id, arrival_date);
CREATE INDEX hotel_reservations_guest_idx ON public.hotel_reservations(restaurant_id, guest_id);

GRANT SELECT, INSERT, UPDATE ON public.hotel_reservations TO authenticated;
GRANT ALL ON public.hotel_reservations TO service_role;
ALTER TABLE public.hotel_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read reservations" ON public.hotel_reservations
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers insert reservations" ON public.hotel_reservations
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers update reservations" ON public.hotel_reservations
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TRIGGER set_hotel_reservations_updated_at BEFORE UPDATE ON public.hotel_reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.hotel_reservation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL,
  event_type text NOT NULL,
  previous_values jsonb,
  new_values jsonb,
  notes text,
  actor_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_reservation_history_same_property FOREIGN KEY (reservation_id, restaurant_id)
    REFERENCES public.hotel_reservations(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT hotel_reservation_history_event_check CHECK (
    event_type IN ('created','confirmed','amended','cancelled','room_assigned','room_changed','status_changed')
  )
);

CREATE INDEX hotel_reservation_history_reservation_idx
  ON public.hotel_reservation_history(reservation_id, created_at DESC);

GRANT SELECT ON public.hotel_reservation_history TO authenticated;
GRANT ALL ON public.hotel_reservation_history TO service_role;
ALTER TABLE public.hotel_reservation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read reservation history" ON public.hotel_reservation_history
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE OR REPLACE FUNCTION public.count_sellable_rooms(_restaurant_id uuid, _room_type_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::int
  FROM public.hotel_rooms r
  JOIN public.room_types t ON t.id = r.room_type_id AND t.restaurant_id = r.restaurant_id
  WHERE r.restaurant_id = _restaurant_id
    AND r.room_type_id = _room_type_id
    AND r.active = true
    AND r.status = 'available'
    AND t.active = true
    AND t.sellable = true;
$$;

CREATE OR REPLACE FUNCTION public.count_reserved_rooms(
  _restaurant_id uuid,
  _room_type_id uuid,
  _arrival date,
  _departure date,
  _exclude_reservation_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::int
  FROM public.hotel_reservations res
  WHERE res.restaurant_id = _restaurant_id
    AND res.room_type_id = _room_type_id
    AND res.status IN ('pending','confirmed')
    AND (_exclude_reservation_id IS NULL OR res.id <> _exclude_reservation_id)
    AND res.arrival_date < _departure
    AND res.departure_date > _arrival;
$$;

REVOKE ALL ON FUNCTION public.count_sellable_rooms(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_reserved_rooms(uuid, uuid, date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_sellable_rooms(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_reserved_rooms(uuid, uuid, date, date, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_reservation_capacity(
  _restaurant_id uuid,
  _room_type_id uuid,
  _room_id uuid,
  _arrival date,
  _departure date,
  _exclude_reservation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sellable integer;
  reserved integer;
  room_ok boolean;
  room_clash integer;
BEGIN
  IF _departure <= _arrival THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  sellable := public.count_sellable_rooms(_restaurant_id, _room_type_id);
  reserved := public.count_reserved_rooms(_restaurant_id, _room_type_id, _arrival, _departure, _exclude_reservation_id);

  IF sellable - reserved <= 0 THEN
    RAISE EXCEPTION 'NO_AVAILABILITY';
  END IF;

  IF _room_id IS NOT NULL THEN
    SELECT true INTO room_ok
    FROM public.hotel_rooms r
    WHERE r.id = _room_id
      AND r.restaurant_id = _restaurant_id
      AND r.room_type_id = _room_type_id
      AND r.active = true
      AND r.status = 'available';

    IF room_ok IS NOT TRUE THEN
      RAISE EXCEPTION 'ROOM_NOT_ASSIGNABLE';
    END IF;

    SELECT count(*) INTO room_clash
    FROM public.hotel_reservations res
    WHERE res.restaurant_id = _restaurant_id
      AND res.room_id = _room_id
      AND res.status IN ('pending','confirmed')
      AND (_exclude_reservation_id IS NULL OR res.id <> _exclude_reservation_id)
      AND res.arrival_date < _departure
      AND res.departure_date > _arrival;

    IF room_clash > 0 THEN
      RAISE EXCEPTION 'ROOM_ALREADY_BOOKED';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_hotel_reservation(
  _restaurant_id uuid,
  _guest_id uuid,
  _room_type_id uuid,
  _room_id uuid,
  _arrival date,
  _departure date,
  _adults integer,
  _children integer,
  _special_requests text,
  _notes text,
  _status text,
  _membership_id uuid
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_number bigint;
  created public.hotel_reservations%ROWTYPE;
BEGIN
  IF _status NOT IN ('pending','confirmed') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  INSERT INTO public.hotel_reservation_counters (restaurant_id, last_number)
  VALUES (_restaurant_id, 0)
  ON CONFLICT (restaurant_id) DO NOTHING;

  SELECT last_number INTO next_number
  FROM public.hotel_reservation_counters
  WHERE restaurant_id = _restaurant_id
  FOR UPDATE;

  PERFORM public.assert_reservation_capacity(
    _restaurant_id, _room_type_id, _room_id, _arrival, _departure, NULL
  );

  next_number := next_number + 1;
  UPDATE public.hotel_reservation_counters
  SET last_number = next_number, updated_at = now()
  WHERE restaurant_id = _restaurant_id;

  INSERT INTO public.hotel_reservations (
    restaurant_id, guest_id, confirmation_number, arrival_date, departure_date,
    adults, children, room_type_id, room_id, status, source,
    special_requests, notes, created_by_staff_membership_id
  ) VALUES (
    _restaurant_id, _guest_id, 'NR-' || lpad(next_number::text, 6, '0'), _arrival, _departure,
    _adults, _children, _room_type_id, _room_id, _status, 'staff',
    _special_requests, _notes, _membership_id
  )
  RETURNING * INTO created;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, created.id, 'created',
    jsonb_build_object(
      'confirmation_number', created.confirmation_number,
      'arrival_date', created.arrival_date,
      'departure_date', created.departure_date,
      'adults', created.adults,
      'children', created.children,
      'room_type_id', created.room_type_id,
      'room_id', created.room_id,
      'status', created.status
    ),
    _membership_id
  );

  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.amend_hotel_reservation(
  _restaurant_id uuid,
  _reservation_id uuid,
  _room_type_id uuid,
  _room_id uuid,
  _arrival date,
  _departure date,
  _adults integer,
  _children integer,
  _special_requests text,
  _notes text,
  _membership_id uuid
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing public.hotel_reservations%ROWTYPE;
  updated public.hotel_reservations%ROWTYPE;
BEGIN
  INSERT INTO public.hotel_reservation_counters (restaurant_id, last_number)
  VALUES (_restaurant_id, 0)
  ON CONFLICT (restaurant_id) DO NOTHING;

  PERFORM 1 FROM public.hotel_reservation_counters
  WHERE restaurant_id = _restaurant_id FOR UPDATE;

  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF existing.status = 'cancelled' THEN
    RAISE EXCEPTION 'RESERVATION_CANCELLED';
  END IF;

  PERFORM public.assert_reservation_capacity(
    _restaurant_id, _room_type_id, _room_id, _arrival, _departure, existing.id
  );

  UPDATE public.hotel_reservations
  SET room_type_id = _room_type_id,
      room_id = _room_id,
      arrival_date = _arrival,
      departure_date = _departure,
      adults = _adults,
      children = _children,
      special_requests = _special_requests,
      notes = _notes
  WHERE id = existing.id
  RETURNING * INTO updated;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id,
    CASE
      WHEN existing.room_id IS DISTINCT FROM updated.room_id AND existing.room_id IS NULL THEN 'room_assigned'
      WHEN existing.room_id IS DISTINCT FROM updated.room_id THEN 'room_changed'
      ELSE 'amended'
    END,
    jsonb_build_object(
      'arrival_date', existing.arrival_date, 'departure_date', existing.departure_date,
      'adults', existing.adults, 'children', existing.children,
      'room_type_id', existing.room_type_id, 'room_id', existing.room_id,
      'special_requests', existing.special_requests, 'notes', existing.notes
    ),
    jsonb_build_object(
      'arrival_date', updated.arrival_date, 'departure_date', updated.departure_date,
      'adults', updated.adults, 'children', updated.children,
      'room_type_id', updated.room_type_id, 'room_id', updated.room_id,
      'special_requests', updated.special_requests, 'notes', updated.notes
    ),
    _membership_id
  );

  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_reservation_capacity(uuid, uuid, uuid, date, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_hotel_reservation(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.amend_hotel_reservation(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_reservation_capacity(uuid, uuid, uuid, date, date, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_hotel_reservation(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.amend_hotel_reservation(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, uuid) TO service_role;
