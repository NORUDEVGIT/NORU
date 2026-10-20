-- Unit-scoped rate plan change, promotion remove, and the commercial ownership rule.
-- hotel_reservation_rooms is the room writer. sync_reservation_room_total rolls the master up.
-- reprice_hotel_reservation is refused when more than one active room unit exists.
-- A promotion discount stays on hotel_reservation_promotions and is not written into room_subtotal.
-- Manual nightly overrides and reservation adjustments are not added here. Folio adjustments stay in Cashiering.
-- Dual-lane with drizzle/migrations/0172_unit_rate_plan_and_promotion_remove.sql.
-- Do not apply from an agent.

ALTER TABLE public.hotel_reservation_history
  DROP CONSTRAINT IF EXISTS hotel_reservation_history_event_check;
ALTER TABLE public.hotel_reservation_history
  ADD CONSTRAINT hotel_reservation_history_event_check
    CHECK (event_type IN (
      'created','confirmed','amended','cancelled','room_assigned','room_changed','status_changed',
      'check_in','check_out','room_moved','stay_extended','stay_shortened','stay_dates_changed',
      'no_show','repriced','expected_arrival_updated','late_checkout_updated',
      'room_guest_added','room_guest_removed','room_primary_guest_changed',
      'external_reservation_created','external_reservation_modified','external_reservation_cancelled',
      'package_applied','package_removed','promotion_applied','promotion_removed',
      'note_pinned','trace_created','trace_updated',
      'assignment_notes_updated','rate_notes_updated'
    ));

COMMENT ON COLUMN public.hotel_reservations.room_subtotal IS
  'Sum of room_subtotal on active room units. Pre-tax room snapshot. Promotion discount stays on hotel_reservation_promotions and is not subtracted here. Manual nightly overrides and reservation adjustments are not stored on this column; folio adjustments stay in Cashiering.';

COMMENT ON COLUMN public.hotel_reservation_rooms.room_subtotal IS
  'Pre-tax room snapshot for this room unit. Promotion discount is not subtracted here. Manual nightly overrides and reservation adjustments are not stored on this column.';

COMMENT ON COLUMN public.hotel_reservation_promotions.discount_amount IS
  'Promotion discount stored beside the room snapshot. Never written into hotel_reservations.room_subtotal or hotel_reservation_rooms.room_subtotal.';

CREATE OR REPLACE FUNCTION public.reprice_hotel_reservation_room(
  _restaurant_id uuid,
  _reservation_id uuid,
  _reservation_room_id uuid,
  _rate_plan_id uuid,
  _membership_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing public.hotel_reservations%ROWTYPE;
  unit public.hotel_reservation_rooms%ROWTYPE;
  pricing jsonb;
  next_subtotal numeric;
  next_currency text;
  master public.hotel_reservations%ROWTYPE;
BEGIN
  SELECT * INTO existing
  FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  SELECT * INTO unit
  FROM public.hotel_reservation_rooms
  WHERE id = _reservation_room_id
    AND reservation_id = _reservation_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_UNIT_NOT_FOUND';
  END IF;
  IF unit.status IN ('cancelled', 'no_show') THEN
    RAISE EXCEPTION 'ROOM_UNIT_NOT_REPRICEABLE';
  END IF;

  pricing := public.price_hotel_stay(
    _restaurant_id,
    _rate_plan_id,
    unit.room_type_id,
    unit.arrival_date,
    unit.departure_date,
    1,
    unit.adults,
    unit.children,
    COALESCE(unit.infants, 0),
    COALESCE(unit.currency, existing.currency),
    CURRENT_DATE
  );
  next_subtotal := (pricing->>'subtotal')::numeric;
  next_currency := pricing->>'currency';

  UPDATE public.hotel_reservation_rooms
     SET rate_plan_id = _rate_plan_id,
         currency = next_currency,
         room_subtotal = next_subtotal,
         nightly_rate_snapshot = pricing->'nightly',
         priced_at = now()
   WHERE id = unit.id;

  PERFORM public.sync_reservation_room_total(_restaurant_id, _reservation_id);

  SELECT * INTO master
  FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id,
    existing.id,
    'repriced',
    jsonb_build_object(
      'reservation_room_id', unit.id,
      'rate_plan_id', unit.rate_plan_id,
      'room_subtotal', unit.room_subtotal,
      'currency', unit.currency,
      'nightly_rate_snapshot', unit.nightly_rate_snapshot
    ),
    jsonb_build_object(
      'reservation_room_id', unit.id,
      'rate_plan_id', _rate_plan_id,
      'room_subtotal', next_subtotal,
      'currency', next_currency,
      'nightly_rate_snapshot', pricing->'nightly',
      'master_room_subtotal', master.room_subtotal
    ),
    _membership_id
  );

  PERFORM public.sync_hotel_reservation_promotion(
    _restaurant_id, existing.id, NULL, 'reevaluate'
  );
  PERFORM public.sync_hotel_reservation_packages(
    _restaurant_id, existing.id, NULL, 'reevaluate'
  );

  RETURN jsonb_build_object(
    'id', existing.id,
    'reservation_room_id', unit.id,
    'room_subtotal', next_subtotal,
    'master_room_subtotal', master.room_subtotal,
    'currency', next_currency
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reprice_hotel_reservation(
  _restaurant_id uuid,
  _reservation_id uuid,
  _rate_plan_id uuid,
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
  pricing jsonb;
  active_units integer;
  all_units integer;
  only_unit uuid;
BEGIN
  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  SELECT count(*) INTO all_units
  FROM public.hotel_reservation_rooms
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id;

  SELECT count(*) INTO active_units
  FROM public.hotel_reservation_rooms
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id
    AND status NOT IN ('cancelled', 'no_show');

  IF COALESCE(active_units, 0) > 1 THEN
    RAISE EXCEPTION 'MULTI_ROOM_REPRICE_REQUIRES_UNIT';
  END IF;

  IF COALESCE(active_units, 0) = 1 THEN
    SELECT unit.id INTO only_unit
    FROM public.hotel_reservation_rooms unit
    WHERE unit.restaurant_id = _restaurant_id
      AND unit.reservation_id = _reservation_id
      AND unit.status NOT IN ('cancelled', 'no_show')
    ORDER BY unit.unit_sequence
    LIMIT 1;

    PERFORM public.reprice_hotel_reservation_room(
      _restaurant_id, _reservation_id, only_unit, _rate_plan_id, _membership_id
    );

    SELECT * INTO updated
    FROM public.hotel_reservations
    WHERE id = existing.id AND restaurant_id = _restaurant_id;
    RETURN updated;
  END IF;

  IF COALESCE(all_units, 0) > 0 THEN
    RAISE EXCEPTION 'ROOM_UNIT_NOT_REPRICEABLE';
  END IF;

  pricing := public.price_hotel_stay(
    _restaurant_id,
    _rate_plan_id,
    existing.room_type_id,
    existing.arrival_date,
    existing.departure_date,
    COALESCE(existing.rooms_requested, 1),
    existing.adults,
    existing.children,
    COALESCE(existing.infants, 0),
    existing.currency,
    CURRENT_DATE
  );

  UPDATE public.hotel_reservations
  SET rate_plan_id = _rate_plan_id,
      currency = pricing->>'currency',
      room_subtotal = (pricing->>'subtotal')::numeric,
      nightly_rate_snapshot = pricing->'nightly',
      priced_at = now()
  WHERE id = existing.id
  RETURNING * INTO updated;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, 'repriced',
    jsonb_build_object('rate_plan_id', existing.rate_plan_id, 'room_subtotal', existing.room_subtotal,
                       'currency', existing.currency),
    jsonb_build_object('rate_plan_id', updated.rate_plan_id, 'room_subtotal', updated.room_subtotal,
                       'currency', updated.currency),
    _membership_id
  );

  PERFORM public.sync_hotel_reservation_promotion(
    _restaurant_id, updated.id, NULL, 'reevaluate'
  );
  PERFORM public.sync_hotel_reservation_packages(
    _restaurant_id, updated.id, NULL, 'reevaluate'
  );

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_hotel_reservation_promotion(
  _restaurant_id uuid,
  _reservation_id uuid,
  _membership_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  reservation_id uuid;
  activation_id uuid;
  discount numeric;
  after_promo numeric;
  base_subtotal numeric;
BEGIN
  SELECT id INTO reservation_id
  FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  SELECT promotion_activation_id, discount_amount, room_subtotal_after_promotion, base_room_subtotal
    INTO activation_id, discount, after_promo, base_subtotal
  FROM public.hotel_reservation_promotions
  WHERE reservation_id = _reservation_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROMOTION_NOT_APPLIED';
  END IF;

  -- Promotion discount stays outside room_subtotal. This delete does not update
  -- hotel_reservations.room_subtotal or hotel_reservation_rooms.room_subtotal.
  DELETE FROM public.hotel_reservation_promotions
  WHERE reservation_id = _reservation_id
    AND restaurant_id = _restaurant_id;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id,
    _reservation_id,
    'promotion_removed',
    jsonb_build_object(
      'promotion_activation_id', activation_id,
      'discount_amount', discount,
      'room_subtotal_after_promotion', after_promo,
      'base_room_subtotal', base_subtotal
    ),
    jsonb_build_object('promotion_activation_id', NULL, 'discount_amount', NULL),
    _membership_id
  );
END;
$$;

COMMENT ON FUNCTION public.remove_hotel_reservation_promotion(uuid, uuid, uuid) IS
  'Deletes the reservation promotion snapshot. Does not change room_subtotal. The discount remains outside the pre-tax room amount.';

REVOKE ALL ON FUNCTION public.reprice_hotel_reservation_room(uuid, uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_hotel_reservation_promotion(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reprice_hotel_reservation_room(uuid, uuid, uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_hotel_reservation_promotion(uuid, uuid, uuid)
  TO service_role;
