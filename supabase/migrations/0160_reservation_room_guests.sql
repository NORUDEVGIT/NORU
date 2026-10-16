-- GROUP-RES-02: occupants of a reservation room unit.
-- hotel_reservations.guest_id stays the lead guest / booker.
-- Unit 1 receives that lead guest as its primary occupant when no explicit
-- assignment covers the room. Sibling rooms are not filled automatically.
-- Apply 0153 through 0159 before this file. Do not apply from an agent.

ALTER TABLE public.hotel_reservation_rooms
  ADD CONSTRAINT hotel_reservation_rooms_id_reservation_unique
  UNIQUE (id, restaurant_id, reservation_id);

CREATE TABLE public.hotel_reservation_room_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL,
  reservation_room_id uuid NOT NULL,
  guest_id uuid NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_reservation_room_guests_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_reservation_room_guests_room_guest_unique UNIQUE (reservation_room_id, guest_id),
  CONSTRAINT hotel_reservation_room_guests_room_same_reservation
    FOREIGN KEY (reservation_room_id, restaurant_id, reservation_id)
    REFERENCES public.hotel_reservation_rooms (id, restaurant_id, reservation_id)
    ON DELETE CASCADE,
  CONSTRAINT hotel_reservation_room_guests_reservation_same_property
    FOREIGN KEY (reservation_id, restaurant_id)
    REFERENCES public.hotel_reservations (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT hotel_reservation_room_guests_guest_same_property
    FOREIGN KEY (guest_id, restaurant_id)
    REFERENCES public.guest_profiles (id, restaurant_id)
);

CREATE UNIQUE INDEX hotel_reservation_room_guests_one_primary
  ON public.hotel_reservation_room_guests (reservation_room_id)
  WHERE is_primary;

CREATE INDEX hotel_reservation_room_guests_reservation_idx
  ON public.hotel_reservation_room_guests (restaurant_id, reservation_id);

COMMENT ON TABLE public.hotel_reservation_room_guests IS
  'Occupants of one reservation room unit. The booking guest_id remains the lead guest.';

GRANT SELECT, INSERT, UPDATE ON public.hotel_reservation_room_guests TO authenticated;
GRANT ALL ON public.hotel_reservation_room_guests TO service_role;
ALTER TABLE public.hotel_reservation_room_guests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read reservation room guests" ON public.hotel_reservation_room_guests
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers insert reservation room guests" ON public.hotel_reservation_room_guests
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers update reservation room guests" ON public.hotel_reservation_room_guests
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Front office read reservation room guests" ON public.hotel_reservation_room_guests
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
CREATE POLICY "Front office insert reservation room guests" ON public.hotel_reservation_room_guests
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
CREATE POLICY "Front office update reservation room guests" ON public.hotel_reservation_room_guests
  FOR UPDATE TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']))
  WITH CHECK (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
CREATE POLICY "Cashiers read reservation room guests" ON public.hotel_reservation_room_guests
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['cashier','accountant']));
CREATE POLICY "Housekeeping read reservation room guests" ON public.hotel_reservation_room_guests
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeper','housekeeping_supervisor']));

CREATE TRIGGER set_hotel_reservation_room_guests_updated_at
  BEFORE UPDATE ON public.hotel_reservation_room_guests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.hotel_reservation_room_guests (
  restaurant_id, reservation_id, reservation_room_id, guest_id, is_primary
)
SELECT unit.restaurant_id, unit.reservation_id, unit.id, reservation.guest_id, true
FROM public.hotel_reservation_rooms unit
JOIN public.hotel_reservations reservation
  ON reservation.id = unit.reservation_id
 AND reservation.restaurant_id = unit.restaurant_id
WHERE unit.unit_sequence = 1
  AND NOT EXISTS (
    SELECT 1
    FROM public.hotel_reservation_room_guests occupant
    WHERE occupant.reservation_room_id = unit.id
      AND occupant.is_primary
  );

CREATE OR REPLACE FUNCTION public.assign_reservation_room_guests(
  _restaurant_id uuid,
  _reservation_id uuid,
  _assignments jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  lead uuid;
  assignment jsonb;
  seq integer;
  guest uuid;
  primary_flag boolean;
  unit_id uuid;
BEGIN
  SELECT reservation.guest_id INTO lead
  FROM public.hotel_reservations reservation
  WHERE reservation.id = _reservation_id
    AND reservation.restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF _assignments IS NOT NULL AND jsonb_typeof(_assignments) = 'array' THEN
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(_assignments) AS row
      WHERE COALESCE((row->>'is_primary')::boolean, false)
      GROUP BY row->>'unit_sequence'
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'ROOM_GUEST_PRIMARY_CONFLICT';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(_assignments) AS row
      GROUP BY row->>'unit_sequence', row->>'guest_id'
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'ROOM_GUEST_DUPLICATE';
    END IF;

    FOR assignment IN SELECT value FROM jsonb_array_elements(_assignments)
    LOOP
      seq := (assignment->>'unit_sequence')::integer;
      guest := NULLIF(assignment->>'guest_id', '')::uuid;
      primary_flag := COALESCE((assignment->>'is_primary')::boolean, false);

      SELECT unit.id INTO unit_id
      FROM public.hotel_reservation_rooms unit
      WHERE unit.restaurant_id = _restaurant_id
        AND unit.reservation_id = _reservation_id
        AND unit.unit_sequence = seq;
      IF unit_id IS NULL THEN
        RAISE EXCEPTION 'ROOM_UNIT_NOT_FOUND';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM public.guest_profiles profile
        WHERE profile.id = guest
          AND profile.restaurant_id = _restaurant_id
      ) THEN
        RAISE EXCEPTION 'GUEST_NOT_FOUND';
      END IF;

      INSERT INTO public.hotel_reservation_room_guests (
        restaurant_id, reservation_id, reservation_room_id, guest_id, is_primary
      ) VALUES (
        _restaurant_id, _reservation_id, unit_id, guest, primary_flag
      );
    END LOOP;
  END IF;

  UPDATE public.hotel_reservation_room_guests occupant
     SET is_primary = true
    FROM public.hotel_reservation_rooms unit
   WHERE unit.restaurant_id = _restaurant_id
     AND unit.reservation_id = _reservation_id
     AND unit.unit_sequence = 1
     AND occupant.reservation_room_id = unit.id
     AND occupant.guest_id = lead
     AND NOT EXISTS (
       SELECT 1
       FROM public.hotel_reservation_room_guests primary_occupant
       WHERE primary_occupant.reservation_room_id = unit.id
         AND primary_occupant.is_primary
     );

  INSERT INTO public.hotel_reservation_room_guests (
    restaurant_id, reservation_id, reservation_room_id, guest_id, is_primary
  )
  SELECT unit.restaurant_id, unit.reservation_id, unit.id, lead, true
  FROM public.hotel_reservation_rooms unit
  WHERE unit.restaurant_id = _restaurant_id
    AND unit.reservation_id = _reservation_id
    AND unit.unit_sequence = 1
    AND NOT EXISTS (
      SELECT 1
      FROM public.hotel_reservation_room_guests occupant
      WHERE occupant.reservation_room_id = unit.id
        AND occupant.is_primary
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.hotel_reservation_room_guests occupant
      WHERE occupant.reservation_room_id = unit.id
        AND occupant.guest_id = lead
    );
END;
$$;

DROP FUNCTION IF EXISTS public.create_hotel_reservation_priced_commercial(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid[], uuid, uuid, text, text, text, text, integer, integer, text, jsonb, text
);

DROP FUNCTION IF EXISTS public.create_hotel_reservation_priced(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, text, jsonb, text
);

CREATE OR REPLACE FUNCTION public.create_hotel_reservation_priced(
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
  _rate_plan_id uuid,
  _membership_id uuid,
  _company_master_id uuid DEFAULT NULL,
  _travel_agent_master_id uuid DEFAULT NULL,
  _commercial_booking_source text DEFAULT NULL,
  _market_segment text DEFAULT NULL,
  _external_reference text DEFAULT NULL,
  _guarantee_method text DEFAULT NULL,
  _rooms integer DEFAULT 1,
  _infants integer DEFAULT 0,
  _quote_currency text DEFAULT NULL,
  _room_units jsonb DEFAULT NULL,
  _reservation_mode text DEFAULT NULL,
  _room_guest_assignments jsonb DEFAULT NULL
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  created public.hotel_reservations%ROWTYPE;
  pricing jsonb;
  plan public.hotel_rate_plans%ROWTYPE;
  cancel_row public.pms_rate_cancellation_policies%ROWTYPE;
  refund_row public.pms_rate_refundability_codes%ROWTYPE;
  unit jsonb;
  unit_index integer;
  unit_count integer;
  unit_type uuid;
  unit_adults integer;
  unit_children integer;
  unit_infants integer;
  unit_plan uuid;
  unit_cap integer;
  unit_pricing jsonb;
  mode_value text;
BEGIN
  created := public.create_hotel_reservation(
    _restaurant_id, _guest_id, _room_type_id, _room_id, _arrival, _departure,
    _adults, _children, _special_requests, _notes, _status, _membership_id,
    _company_master_id, _travel_agent_master_id,
    _commercial_booking_source, _market_segment, _external_reference, _guarantee_method
  );

  UPDATE public.hotel_reservations
     SET rooms_requested = COALESCE(_rooms, 1),
         infants = COALESCE(_infants, 0)
   WHERE id = created.id
  RETURNING * INTO created;

  IF _rate_plan_id IS NOT NULL THEN
    pricing := public.price_hotel_stay(
      _restaurant_id, _rate_plan_id, _room_type_id, _arrival, _departure,
      COALESCE(_rooms, 1), _adults, _children, COALESCE(_infants, 0), _quote_currency, CURRENT_DATE
    );

    SELECT * INTO plan FROM public.hotel_rate_plans
     WHERE id = _rate_plan_id AND restaurant_id = _restaurant_id;
    IF plan.cancellation_policy_id IS NOT NULL THEN
      SELECT * INTO cancel_row FROM public.pms_rate_cancellation_policies
       WHERE id = plan.cancellation_policy_id AND restaurant_id = _restaurant_id;
    END IF;
    IF plan.refundability_id IS NOT NULL THEN
      SELECT * INTO refund_row FROM public.pms_rate_refundability_codes
       WHERE id = plan.refundability_id AND restaurant_id = _restaurant_id;
    END IF;

    UPDATE public.hotel_reservations
    SET rate_plan_id = _rate_plan_id,
        currency = pricing->>'currency',
        room_subtotal = (pricing->>'subtotal')::numeric,
        nightly_rate_snapshot = pricing->'nightly',
        priced_at = now(),
        cancellation_policy_snapshot = CASE
          WHEN cancel_row.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', cancel_row.id,
            'code', cancel_row.code,
            'name', cancel_row.name,
            'deadline_hours', cancel_row.deadline_hours,
            'penalty_type', cancel_row.penalty_type,
            'penalty_value', cancel_row.penalty_value
          )
        END,
        refundability_snapshot = CASE
          WHEN refund_row.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', refund_row.id,
            'code', refund_row.code,
            'name', refund_row.name,
            'kind', refund_row.kind
          )
        END
    WHERE id = created.id
    RETURNING * INTO created;
  END IF;

  unit_count := CASE
    WHEN _room_units IS NULL OR jsonb_typeof(_room_units) <> 'array' THEN 0
    ELSE jsonb_array_length(_room_units)
  END;

  IF unit_count > 20 THEN
    RAISE EXCEPTION 'INVALID_ROOM_UNITS';
  END IF;

  IF unit_count > 0 THEN
    unit := _room_units->0;
    IF (unit->>'room_type_id')::uuid IS DISTINCT FROM _room_type_id
       OR COALESCE((unit->>'adults')::integer, _adults) IS DISTINCT FROM _adults
       OR COALESCE((unit->>'children')::integer, _children) IS DISTINCT FROM _children
       OR COALESCE((unit->>'infants')::integer, COALESCE(_infants, 0)) IS DISTINCT FROM COALESCE(_infants, 0)
       OR NULLIF(unit->>'rate_plan_id', '')::uuid IS DISTINCT FROM _rate_plan_id
    THEN
      RAISE EXCEPTION 'ROOM_UNIT_MASTER_MISMATCH';
    END IF;
  END IF;

  mode_value := lower(btrim(COALESCE(_reservation_mode, '')));
  IF mode_value = '' THEN
    mode_value := CASE WHEN unit_count > 1 THEN 'group' ELSE 'single' END;
  ELSIF mode_value NOT IN ('single', 'group') THEN
    RAISE EXCEPTION 'INVALID_RESERVATION_MODE';
  END IF;

  IF mode_value = 'single' AND unit_count > 1 THEN
    RAISE EXCEPTION 'SINGLE_RESERVATION_ROOM_LIMIT';
  END IF;

  UPDATE public.hotel_reservations
     SET reservation_mode = mode_value
   WHERE id = created.id
     AND restaurant_id = created.restaurant_id
  RETURNING * INTO created;

  INSERT INTO public.hotel_reservation_rooms (
    restaurant_id, reservation_id, unit_sequence, room_type_id, room_id,
    arrival_date, departure_date, adults, children, infants, rate_plan_id,
    currency, nightly_rate_snapshot, room_subtotal, priced_at
  ) VALUES (
    created.restaurant_id, created.id, 1, created.room_type_id, created.room_id,
    created.arrival_date, created.departure_date, created.adults, created.children,
    created.infants, created.rate_plan_id, created.currency, created.nightly_rate_snapshot,
    created.room_subtotal, created.priced_at
  );

  FOR unit_index IN 1..GREATEST(unit_count - 1, 0) LOOP
    unit := _room_units->unit_index;
    unit_type := NULLIF(unit->>'room_type_id', '')::uuid;
    unit_adults := COALESCE((unit->>'adults')::integer, 1);
    unit_children := COALESCE((unit->>'children')::integer, 0);
    unit_infants := COALESCE((unit->>'infants')::integer, 0);
    unit_plan := NULLIF(unit->>'rate_plan_id', '')::uuid;

    SELECT room_type.max_occupancy INTO unit_cap
      FROM public.room_types room_type
     WHERE room_type.id = unit_type
       AND room_type.restaurant_id = _restaurant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ROOM_TYPE_NOT_FOUND';
    END IF;
    IF unit_cap IS NOT NULL AND unit_adults + unit_children > unit_cap THEN
      RAISE EXCEPTION 'OCCUPANCY_EXCEEDED';
    END IF;

    unit_pricing := NULL;
    IF unit_plan IS NOT NULL THEN
      unit_pricing := public.price_hotel_stay(
        _restaurant_id, unit_plan, unit_type, created.arrival_date, created.departure_date,
        1, unit_adults, unit_children, unit_infants, created.currency, CURRENT_DATE
      );
    END IF;

    INSERT INTO public.hotel_reservation_rooms (
      restaurant_id, reservation_id, unit_sequence, room_type_id, room_id,
      arrival_date, departure_date, adults, children, infants, rate_plan_id,
      currency, nightly_rate_snapshot, room_subtotal, priced_at
    ) VALUES (
      created.restaurant_id,
      created.id,
      unit_index + 1,
      unit_type,
      NULL,
      created.arrival_date,
      created.departure_date,
      unit_adults,
      unit_children,
      unit_infants,
      unit_plan,
      CASE WHEN unit_pricing IS NULL THEN NULL ELSE unit_pricing->>'currency' END,
      CASE WHEN unit_pricing IS NULL THEN NULL ELSE unit_pricing->'nightly' END,
      CASE WHEN unit_pricing IS NULL THEN NULL ELSE (unit_pricing->>'subtotal')::numeric END,
      CASE WHEN unit_pricing IS NULL THEN NULL ELSE now() END
    );
  END LOOP;

  PERFORM public.assert_reservation_room_units(created.restaurant_id, created.id);
  PERFORM public.sync_reservation_room_total(created.restaurant_id, created.id);
  PERFORM public.assign_reservation_room_guests(created.restaurant_id, created.id, _room_guest_assignments);
  SELECT * INTO created FROM public.hotel_reservations WHERE id = created.id;

  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_hotel_reservation_priced_commercial(
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
  _rate_plan_id uuid,
  _membership_id uuid,
  _promotion_activation_id uuid DEFAULT NULL,
  _package_activation_ids uuid[] DEFAULT NULL,
  _company_master_id uuid DEFAULT NULL,
  _travel_agent_master_id uuid DEFAULT NULL,
  _commercial_booking_source text DEFAULT NULL,
  _market_segment text DEFAULT NULL,
  _external_reference text DEFAULT NULL,
  _guarantee_method text DEFAULT NULL,
  _rooms integer DEFAULT 1,
  _infants integer DEFAULT 0,
  _quote_currency text DEFAULT NULL,
  _room_units jsonb DEFAULT NULL,
  _reservation_mode text DEFAULT NULL,
  _room_guest_assignments jsonb DEFAULT NULL
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  created public.hotel_reservations%ROWTYPE;
BEGIN
  created := public.create_hotel_reservation_priced(
    _restaurant_id, _guest_id, _room_type_id, _room_id, _arrival, _departure,
    _adults, _children, _special_requests, _notes, _status, _rate_plan_id, _membership_id,
    _company_master_id, _travel_agent_master_id,
    _commercial_booking_source, _market_segment, _external_reference, _guarantee_method,
    _rooms, _infants, _quote_currency, _room_units, _reservation_mode, _room_guest_assignments
  );

  IF _promotion_activation_id IS NOT NULL THEN
    PERFORM public.sync_hotel_reservation_promotion(
      _restaurant_id, created.id, _promotion_activation_id, 'apply'
    );
  END IF;

  IF _package_activation_ids IS NOT NULL THEN
    PERFORM public.sync_hotel_reservation_packages(
      _restaurant_id, created.id, _package_activation_ids, 'apply'
    );
  END IF;

  SELECT * INTO created FROM public.hotel_reservations WHERE id = created.id;
  RETURN created;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_reservation_room_guests(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_reservation_room_guests(uuid, uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.create_hotel_reservation_priced(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, text, jsonb, text, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_hotel_reservation_priced(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, text, jsonb, text, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.create_hotel_reservation_priced_commercial(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid[], uuid, uuid, text, text, text, text, integer, integer, text, jsonb, text, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_hotel_reservation_priced_commercial(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid[], uuid, uuid, text, text, text, text, integer, integer, text, jsonb, text, jsonb
) TO service_role;

