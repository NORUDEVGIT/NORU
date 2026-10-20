-- Qualify promotion activation scope lookups.
--
-- sync_hotel_reservation_promotion declares a PL/pgSQL variable named activation_id.
-- hotel_promotion_activation_room_types and hotel_promotion_activation_rate_plans
-- also have an activation_id column. Unqualified WHERE activation_id = activation.id
-- raises: column reference "activation_id" is ambiguous.
-- Apply Promotion reaches those two lookups after the activation row is loaded.
-- The variable name and the RPC signature stay the same. The column is qualified.
-- This replace does not write hotel_reservations.room_subtotal or any room-unit price.
-- One reservation_id conflict still replaces the single promotion snapshot.
--
-- Dual-lane with drizzle/migrations/0173_sync_hotel_reservation_promotion_activation_id.sql.
-- Do not apply from an agent.

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

  SELECT COALESCE(array_agg(activation_room.room_type_id), ARRAY[]::uuid[])
    INTO activation_room_ids
  FROM public.hotel_promotion_activation_room_types AS activation_room
  WHERE activation_room.activation_id = activation.id
    AND activation_room.restaurant_id = _restaurant_id;

  SELECT COALESCE(array_agg(activation_plan.rate_plan_id), ARRAY[]::uuid[])
    INTO activation_plan_ids
  FROM public.hotel_promotion_activation_rate_plans AS activation_plan
  WHERE activation_plan.activation_id = activation.id
    AND activation_plan.restaurant_id = _restaurant_id;

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
