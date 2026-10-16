-- P5A-02 — Promotion eligibility persist + atomic reservation attribution.
-- Dual-lane with supabase/migrations/0105_pms_commercial_promotion_engine.sql.
-- Does not edit 0016 price_hotel_stay.
-- Does not add package pricing or activation apply RPCs.
-- create_hotel_reservation_priced stays the unpromoted writer.
-- create_hotel_reservation_priced_commercial wraps it when a promotion is selected.
-- reprice_hotel_reservation and amend_hotel_reservation_priced reevaluate
-- existing attribution after the room snapshot write, same transaction.

CREATE OR REPLACE FUNCTION public.sync_hotel_reservation_promotion(
  _restaurant_id uuid,
  _reservation_id uuid,
  _promotion_activation_id uuid,
  _mode text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  reservation public.hotel_reservations%ROWTYPE;
  activation public.hotel_promotion_activations%ROWTYPE;
  master public.pms_promotions%ROWTYPE;
  booking_date date;
  activation_id uuid := _promotion_activation_id;
  last_night date;
  base numeric(12,2);
  discount numeric(12,2);
  after_promo numeric(12,2);
  activation_room_ids uuid[];
  activation_plan_ids uuid[];
  master_room_ids uuid[];
  effective_room_ids uuid[];
  reason text;
BEGIN
  IF _mode NOT IN ('apply', 'reevaluate') THEN
    RAISE EXCEPTION 'PROMOTION_VALUE_INVALID';
  END IF;

  SELECT * INTO reservation
  FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF activation_id IS NULL THEN
    SELECT promotion_activation_id INTO activation_id
    FROM public.hotel_reservation_promotions
    WHERE reservation_id = reservation.id;
    IF activation_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  SELECT COALESCE(business_date, CURRENT_DATE) INTO booking_date
  FROM public.restaurants
  WHERE id = _restaurant_id;

  SELECT * INTO activation
  FROM public.hotel_promotion_activations
  WHERE id = activation_id;
  IF NOT FOUND THEN
    IF _mode = 'apply' THEN
      RAISE EXCEPTION 'PROMOTION_ACTIVATION_NOT_FOUND';
    END IF;
    DELETE FROM public.hotel_reservation_promotions WHERE reservation_id = reservation.id;
    RETURN;
  END IF;

  reason := NULL;
  IF activation.restaurant_id IS DISTINCT FROM _restaurant_id THEN
    reason := 'PROMOTION_WRONG_PROPERTY';
  ELSIF activation.active IS NOT TRUE THEN
    reason := 'PROMOTION_INACTIVE';
  ELSE
    SELECT * INTO master
    FROM public.pms_promotions
    WHERE id = activation.promotion_id AND restaurant_id = _restaurant_id;
    IF NOT FOUND THEN
      reason := 'PROMOTION_NOT_FOUND';
    ELSIF master.active IS NOT TRUE THEN
      reason := 'PROMOTION_INACTIVE';
    END IF;
  END IF;

  IF reason IS NULL AND (
    booking_date < activation.booking_from OR booking_date > activation.booking_to
  ) THEN
    reason := 'PROMOTION_BOOKING_WINDOW_MISMATCH';
  END IF;

  last_night := reservation.departure_date - 1;
  IF reason IS NULL AND (
    reservation.arrival_date < activation.valid_from OR last_night > activation.valid_to
  ) THEN
    reason := 'PROMOTION_STAY_WINDOW_MISMATCH';
  END IF;

  SELECT COALESCE(array_agg(room_type_id), ARRAY[]::uuid[])
    INTO activation_room_ids
  FROM public.hotel_promotion_activation_room_types
  WHERE activation_id = activation.id AND restaurant_id = _restaurant_id;

  SELECT COALESCE(array_agg(rate_plan_id), ARRAY[]::uuid[])
    INTO activation_plan_ids
  FROM public.hotel_promotion_activation_rate_plans
  WHERE activation_id = activation.id AND restaurant_id = _restaurant_id;

  SELECT COALESCE(
    CASE
      WHEN jsonb_typeof(activation.master_room_type_ids) = 'array' THEN
        ARRAY(SELECT jsonb_array_elements_text(activation.master_room_type_ids)::uuid)
      ELSE ARRAY[]::uuid[]
    END,
    ARRAY[]::uuid[]
  ) INTO master_room_ids;

  IF cardinality(activation_room_ids) > 0 THEN
    effective_room_ids := activation_room_ids;
  ELSE
    effective_room_ids := master_room_ids;
  END IF;

  IF reason IS NULL AND cardinality(effective_room_ids) > 0
     AND NOT (reservation.room_type_id = ANY (effective_room_ids)) THEN
    reason := 'PROMOTION_ROOM_TYPE_MISMATCH';
  END IF;

  IF reason IS NULL AND cardinality(activation_plan_ids) > 0
     AND (reservation.rate_plan_id IS NULL OR NOT (reservation.rate_plan_id = ANY (activation_plan_ids))) THEN
    reason := 'PROMOTION_RATE_PLAN_MISMATCH';
  END IF;

  IF reason IS NULL AND activation.promo_kind = 'free_night' THEN
    reason := 'PROMOTION_KIND_UNSUPPORTED';
  ELSIF reason IS NULL AND activation.promo_kind NOT IN ('percent', 'fixed') THEN
    reason := 'PROMOTION_KIND_UNSUPPORTED';
  END IF;

  base := COALESCE(reservation.room_subtotal, 0);
  IF reason IS NULL AND reservation.room_subtotal IS NULL THEN
    reason := 'PROMOTION_VALUE_INVALID';
  ELSIF reason IS NULL AND activation.promo_kind = 'percent'
        AND (activation.promo_value <= 0 OR activation.promo_value > 100) THEN
    reason := 'PROMOTION_VALUE_INVALID';
  ELSIF reason IS NULL AND activation.promo_kind = 'fixed'
        AND activation.promo_value <= 0 THEN
    reason := 'PROMOTION_VALUE_INVALID';
  END IF;

  IF reason IS NOT NULL THEN
    IF _mode = 'apply' THEN
      RAISE EXCEPTION '%', reason;
    END IF;
    DELETE FROM public.hotel_reservation_promotions WHERE reservation_id = reservation.id;
    RETURN;
  END IF;

  IF activation.promo_kind = 'percent' THEN
    discount := ROUND(base * activation.promo_value / 100.0, 2);
  ELSE
    discount := activation.promo_value;
  END IF;
  IF discount < 0 THEN
    discount := 0;
  END IF;
  IF discount > base THEN
    discount := base;
  END IF;
  after_promo := base - discount;

  INSERT INTO public.hotel_reservation_promotions (
    restaurant_id,
    reservation_id,
    promotion_activation_id,
    promotion_id,
    promotion_code,
    promotion_name,
    promo_kind,
    promo_value,
    base_room_subtotal,
    discount_amount,
    room_subtotal_after_promotion,
    snapshot
  ) VALUES (
    _restaurant_id,
    reservation.id,
    activation.id,
    activation.promotion_id,
    activation.promotion_code,
    activation.promotion_name,
    activation.promo_kind,
    activation.promo_value,
    base,
    discount,
    after_promo,
    jsonb_build_object(
      'activationId', activation.id,
      'promotionId', activation.promotion_id,
      'code', activation.promotion_code,
      'name', activation.promotion_name,
      'kind', activation.promo_kind,
      'value', activation.promo_value,
      'bookingFrom', activation.booking_from,
      'bookingTo', activation.booking_to,
      'validFrom', activation.valid_from,
      'validTo', activation.valid_to,
      'roomTypeIds', to_jsonb(activation_room_ids),
      'ratePlanIds', to_jsonb(activation_plan_ids),
      'masterRoomTypeIds', to_jsonb(master_room_ids),
      'priority', activation.priority,
      'reason', activation.reason
    )
  )
  ON CONFLICT (reservation_id) DO UPDATE SET
    restaurant_id = EXCLUDED.restaurant_id,
    promotion_activation_id = EXCLUDED.promotion_activation_id,
    promotion_id = EXCLUDED.promotion_id,
    promotion_code = EXCLUDED.promotion_code,
    promotion_name = EXCLUDED.promotion_name,
    promo_kind = EXCLUDED.promo_kind,
    promo_value = EXCLUDED.promo_value,
    base_room_subtotal = EXCLUDED.base_room_subtotal,
    discount_amount = EXCLUDED.discount_amount,
    room_subtotal_after_promotion = EXCLUDED.room_subtotal_after_promotion,
    snapshot = EXCLUDED.snapshot,
    applied_at = now();
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
  _promotion_activation_id uuid,
  _company_master_id uuid DEFAULT NULL,
  _travel_agent_master_id uuid DEFAULT NULL,
  _commercial_booking_source text DEFAULT NULL,
  _market_segment text DEFAULT NULL,
  _external_reference text DEFAULT NULL,
  _guarantee_method text DEFAULT NULL
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
    _commercial_booking_source, _market_segment, _external_reference, _guarantee_method
  );

  IF _promotion_activation_id IS NOT NULL THEN
    PERFORM public.sync_hotel_reservation_promotion(
      _restaurant_id, created.id, _promotion_activation_id, 'apply'
    );
    SELECT * INTO created FROM public.hotel_reservations WHERE id = created.id;
  END IF;

  RETURN created;
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
BEGIN
  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  pricing := public.price_hotel_stay(
    _restaurant_id, _rate_plan_id, existing.room_type_id, existing.arrival_date, existing.departure_date
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

  RETURN updated;
END;
$$;

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
  _membership_id uuid
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
BEGIN
  SELECT * INTO before_row FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  updated := public.amend_hotel_reservation(
    _restaurant_id, _reservation_id, _room_type_id, _room_id, _arrival, _departure,
    _adults, _children, _special_requests, _notes, _membership_id
  );

  stay_changed := before_row.arrival_date IS DISTINCT FROM updated.arrival_date
    OR before_row.departure_date IS DISTINCT FROM updated.departure_date
    OR before_row.room_type_id IS DISTINCT FROM updated.room_type_id
    OR before_row.rate_plan_id IS DISTINCT FROM _rate_plan_id;

  IF _rate_plan_id IS NOT NULL AND stay_changed THEN
    pricing := public.price_hotel_stay(_restaurant_id, _rate_plan_id, updated.room_type_id, updated.arrival_date, updated.departure_date);

    UPDATE public.hotel_reservations
    SET rate_plan_id = _rate_plan_id,
        currency = pricing->>'currency',
        room_subtotal = (pricing->>'subtotal')::numeric,
        nightly_rate_snapshot = pricing->'nightly',
        priced_at = now()
    WHERE id = updated.id
    RETURNING * INTO updated;

    INSERT INTO public.hotel_reservation_history (
      restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id, updated.id, 'repriced',
      jsonb_build_object('rate_plan_id', before_row.rate_plan_id, 'room_subtotal', before_row.room_subtotal,
                         'currency', before_row.currency),
      jsonb_build_object('rate_plan_id', updated.rate_plan_id, 'room_subtotal', updated.room_subtotal,
                         'currency', updated.currency),
      _membership_id
    );
  END IF;

  PERFORM public.sync_hotel_reservation_promotion(
    _restaurant_id, updated.id, NULL, 'reevaluate'
  );

  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_hotel_reservation_promotion(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_hotel_reservation_priced_commercial(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_hotel_reservation_promotion(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_hotel_reservation_priced_commercial(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid, uuid, text, text, text, text) TO service_role;
