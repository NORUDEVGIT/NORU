-- STAY-08A reservation room units.
--
-- hotel_reservations remains the booking and the runtime room authority.
-- This table stores one child room unit per existing reservation so a later
-- phase can own real multi-room stays. Nothing in the application reads or
-- writes it yet. There is no sync trigger: a later master amend can drift
-- the child until that writer exists.
--
-- The reservation foreign key cascades, matching hotel_reservation_history
-- and hotel_reservation_packages, so a deleted booking does not leave orphan
-- units. Room, room-type, and rate-plan references do not cascade.
--
-- Dual-lane: byte-identical copies.
-- Do not apply from an agent.

CREATE TABLE public.hotel_reservation_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL,
  unit_sequence integer NOT NULL,
  room_type_id uuid NOT NULL,
  room_id uuid,
  arrival_date date NOT NULL,
  departure_date date NOT NULL,
  adults integer NOT NULL,
  children integer NOT NULL DEFAULT 0,
  infants integer NOT NULL DEFAULT 0,
  rate_plan_id uuid,
  currency text,
  nightly_rate_snapshot jsonb,
  room_subtotal numeric(12,2),
  priced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_reservation_rooms_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_reservation_rooms_sequence_unique UNIQUE (reservation_id, unit_sequence),
  CONSTRAINT hotel_reservation_rooms_sequence_check CHECK (unit_sequence >= 1),
  CONSTRAINT hotel_reservation_rooms_dates_check CHECK (departure_date > arrival_date),
  CONSTRAINT hotel_reservation_rooms_occupancy_check CHECK (
    adults >= 1 AND children >= 0 AND infants >= 0
  ),
  CONSTRAINT hotel_reservation_rooms_reservation_same_property
    FOREIGN KEY (reservation_id, restaurant_id)
    REFERENCES public.hotel_reservations (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT hotel_reservation_rooms_type_same_property
    FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types (id, restaurant_id),
  CONSTRAINT hotel_reservation_rooms_room_same_type
    FOREIGN KEY (room_id, restaurant_id, room_type_id)
    REFERENCES public.hotel_rooms (id, restaurant_id, room_type_id),
  CONSTRAINT hotel_reservation_rooms_rate_plan_same_property
    FOREIGN KEY (rate_plan_id, restaurant_id)
    REFERENCES public.hotel_rate_plans (id, restaurant_id)
);

COMMENT ON TABLE public.hotel_reservation_rooms IS
  'Room units owned by a booking. STAY-08A backfill only. hotel_reservations room columns stay authoritative.';

CREATE INDEX hotel_reservation_rooms_reservation_idx
  ON public.hotel_reservation_rooms (restaurant_id, reservation_id);
CREATE INDEX hotel_reservation_rooms_type_idx
  ON public.hotel_reservation_rooms (restaurant_id, room_type_id, arrival_date);
CREATE INDEX hotel_reservation_rooms_room_idx
  ON public.hotel_reservation_rooms (restaurant_id, room_id, arrival_date);

GRANT SELECT, INSERT, UPDATE ON public.hotel_reservation_rooms TO authenticated;
GRANT ALL ON public.hotel_reservation_rooms TO service_role;
ALTER TABLE public.hotel_reservation_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read reservation rooms" ON public.hotel_reservation_rooms
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers insert reservation rooms" ON public.hotel_reservation_rooms
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers update reservation rooms" ON public.hotel_reservation_rooms
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Front office read reservation rooms" ON public.hotel_reservation_rooms
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
CREATE POLICY "Front office insert reservation rooms" ON public.hotel_reservation_rooms
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
CREATE POLICY "Front office update reservation rooms" ON public.hotel_reservation_rooms
  FOR UPDATE TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']))
  WITH CHECK (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

CREATE POLICY "Cashiers read reservation rooms" ON public.hotel_reservation_rooms
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['cashier','accountant']));
CREATE POLICY "Housekeeping read reservation rooms" ON public.hotel_reservation_rooms
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeper','housekeeping_supervisor']));

CREATE TRIGGER set_hotel_reservation_rooms_updated_at
  BEFORE UPDATE ON public.hotel_reservation_rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.hotel_reservation_rooms (
  restaurant_id,
  reservation_id,
  unit_sequence,
  room_type_id,
  room_id,
  arrival_date,
  departure_date,
  adults,
  children,
  infants,
  rate_plan_id,
  currency,
  nightly_rate_snapshot,
  room_subtotal,
  priced_at
)
SELECT
  reservation.restaurant_id,
  reservation.id,
  1,
  reservation.room_type_id,
  reservation.room_id,
  reservation.arrival_date,
  reservation.departure_date,
  reservation.adults,
  reservation.children,
  reservation.infants,
  reservation.rate_plan_id,
  reservation.currency,
  reservation.nightly_rate_snapshot,
  reservation.room_subtotal,
  reservation.priced_at
FROM public.hotel_reservations reservation
WHERE NOT EXISTS (
  SELECT 1
  FROM public.hotel_reservation_rooms unit
  WHERE unit.reservation_id = reservation.id
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.hotel_reservations reservation
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.hotel_reservation_rooms unit
      WHERE unit.reservation_id = reservation.id
        AND unit.restaurant_id = reservation.restaurant_id
        AND unit.unit_sequence = 1
        AND unit.room_type_id = reservation.room_type_id
        AND unit.room_id IS NOT DISTINCT FROM reservation.room_id
        AND unit.arrival_date = reservation.arrival_date
        AND unit.departure_date = reservation.departure_date
        AND unit.adults = reservation.adults
        AND unit.children = reservation.children
        AND unit.infants = reservation.infants
        AND unit.rate_plan_id IS NOT DISTINCT FROM reservation.rate_plan_id
        AND unit.currency IS NOT DISTINCT FROM reservation.currency
        AND unit.nightly_rate_snapshot IS NOT DISTINCT FROM reservation.nightly_rate_snapshot
        AND unit.room_subtotal IS NOT DISTINCT FROM reservation.room_subtotal
        AND unit.priced_at IS NOT DISTINCT FROM reservation.priced_at
    )
  ) THEN
    RAISE EXCEPTION 'STAY08A_BACKFILL_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT unit.reservation_id
    FROM public.hotel_reservation_rooms unit
    GROUP BY unit.reservation_id
    HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION 'STAY08A_BACKFILL_MISMATCH';
  END IF;
END $$;
