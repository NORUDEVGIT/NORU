-- Reprice a stay amendment with the reservation's real occupancy.
--
-- amend_hotel_reservation_priced used to call the 5-argument price_hotel_stay.
-- Migration 0116 dropped that signature. The remaining function defaults to
-- 1 adult, 0 children, 0 infants, and CURRENT_DATE, so a date change with a
-- rate plan repriced the wrong party.
--
-- This replacement:
--   * prices one room (hotel_reservations.room_id is a single assignment)
--   * passes adults, children, and infants
--   * refuses checked-out and no-show amendments, and refuses date changes
--     unless the stay is pending or confirmed
--   * writes stay_extended when only the departure moves later, otherwise
--     stay_dates_changed when either date moves
--   * keeps repriced when the room subtotal is recalculated
--   * recomputes deposit_requirement_snapshot.computed_amount from the stored
--     deposit terms and the new quote
--   * leaves cancellation, no-show, early-departure, and refundability
--     snapshots untouched — those are the terms captured at booking
--   * reevaluates packages and promotions only when the stay itself changed
--
-- Availability and assigned-room conflicts stay inside amend_hotel_reservation
-- (NO_AVAILABILITY / ROOM_ALREADY_BOOKED). This does not move the guest or
-- open a second reservation.
--
-- Dual-lane: byte-identical copies.
-- Do not apply from an agent. Do not edit 0106 or 0150.

DROP FUNCTION IF EXISTS public.amend_hotel_reservation_priced(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, uuid, uuid
);

CREATE OR REPLACE FUNCTION public.amend_hotel_reservation_priced(
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
  _rate_plan_id uuid,
  _membership_id uuid,
  _infants integer DEFAULT NULL
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  before_row public.hotel_reservations%ROWTYPE;
  updated public.hotel_reservations%ROWTYPE;
  pricing jsonb;
  stay_changed boolean;
  dates_changed boolean;
  extended boolean;
  deposit_type text;
  deposit_value numeric;
  computed_amount numeric;
  first_night numeric;
BEGIN
  SELECT * INTO before_row
    FROM public.hotel_reservations
   WHERE id = _reservation_id
     AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF before_row.status IN ('checked_out', 'no_show') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  dates_changed := before_row.arrival_date IS DISTINCT FROM _arrival
    OR before_row.departure_date IS DISTINCT FROM _departure;
  IF dates_changed AND before_row.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  updated := public.amend_hotel_reservation(
    _restaurant_id, _reservation_id, _room_type_id, _room_id, _arrival, _departure,
    _adults, _children, _special_requests, _notes, _membership_id
  );

  IF _infants IS NOT NULL AND before_row.infants IS DISTINCT FROM _infants THEN
    UPDATE public.hotel_reservations
       SET infants = _infants
     WHERE id = updated.id
    RETURNING * INTO updated;
  END IF;

  stay_changed := dates_changed
    OR before_row.room_type_id IS DISTINCT FROM updated.room_type_id
    OR before_row.rate_plan_id IS DISTINCT FROM _rate_plan_id
    OR before_row.adults IS DISTINCT FROM updated.adults
    OR before_row.children IS DISTINCT FROM updated.children
    OR (_infants IS NOT NULL AND before_row.infants IS DISTINCT FROM _infants);

  IF dates_changed THEN
    extended := before_row.arrival_date IS NOT DISTINCT FROM updated.arrival_date
      AND updated.departure_date > before_row.departure_date;
    INSERT INTO public.hotel_reservation_history (
      restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id,
      updated.id,
      CASE WHEN extended THEN 'stay_extended' ELSE 'stay_dates_changed' END,
      jsonb_build_object(
        'arrival_date', before_row.arrival_date,
        'departure_date', before_row.departure_date,
        'adults', before_row.adults,
        'children', before_row.children,
        'infants', before_row.infants,
        'nights', (before_row.departure_date - before_row.arrival_date)
      ),
      jsonb_build_object(
        'arrival_date', updated.arrival_date,
        'departure_date', updated.departure_date,
        'adults', updated.adults,
        'children', updated.children,
        'infants', updated.infants,
        'nights', (updated.departure_date - updated.arrival_date)
      ),
      _membership_id
    );
  END IF;

  IF _rate_plan_id IS NOT NULL AND stay_changed THEN
    pricing := public.price_hotel_stay(
      _restaurant_id,
      _rate_plan_id,
      updated.room_type_id,
      updated.arrival_date,
      updated.departure_date,
      1,
      updated.adults,
      updated.children,
      COALESCE(updated.infants, 0),
      updated.currency,
      CURRENT_DATE
    );

    UPDATE public.hotel_reservations
       SET rate_plan_id = _rate_plan_id,
           currency = pricing->>'currency',
           room_subtotal = (pricing->>'subtotal')::numeric,
           nightly_rate_snapshot = pricing->'nightly',
           priced_at = now()
     WHERE id = updated.id
    RETURNING * INTO updated;

    IF updated.deposit_requirement_snapshot IS NOT NULL THEN
      deposit_type := updated.deposit_requirement_snapshot->>'deposit_type';
      deposit_value := COALESCE((updated.deposit_requirement_snapshot->>'deposit_value')::numeric, 0);
      first_night := COALESCE((pricing->'nightly'->0->>'rate')::numeric, 0);
      computed_amount := CASE deposit_type
        WHEN 'none' THEN 0
        WHEN 'fixed' THEN round(deposit_value, 2)
        WHEN 'percent' THEN round((pricing->>'subtotal')::numeric * deposit_value / 100.0, 2)
        WHEN 'first_night' THEN round(first_night, 2)
        ELSE COALESCE((updated.deposit_requirement_snapshot->>'computed_amount')::numeric, 0)
      END;
      UPDATE public.hotel_reservations
         SET deposit_requirement_snapshot = jsonb_set(
           updated.deposit_requirement_snapshot,
           '{computed_amount}',
           to_jsonb(computed_amount),
           true
         )
       WHERE id = updated.id
      RETURNING * INTO updated;
    END IF;

    INSERT INTO public.hotel_reservation_history (
      restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id, updated.id, 'repriced',
      jsonb_build_object(
        'rate_plan_id', before_row.rate_plan_id,
        'room_subtotal', before_row.room_subtotal,
        'currency', before_row.currency,
        'adults', before_row.adults,
        'children', before_row.children,
        'infants', before_row.infants
      ),
      jsonb_build_object(
        'rate_plan_id', updated.rate_plan_id,
        'room_subtotal', updated.room_subtotal,
        'currency', updated.currency,
        'adults', updated.adults,
        'children', updated.children,
        'infants', updated.infants,
        'rooms', 1
      ),
      _membership_id
    );
  END IF;

  IF stay_changed THEN
    PERFORM public.sync_hotel_reservation_promotion(
      _restaurant_id, updated.id, NULL, 'reevaluate'
    );
    PERFORM public.sync_hotel_reservation_packages(
      _restaurant_id, updated.id, NULL, 'reevaluate'
    );
  END IF;

  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.amend_hotel_reservation_priced(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, uuid, uuid, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.amend_hotel_reservation_priced(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, uuid, uuid, integer
) TO service_role;
