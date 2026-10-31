-- Phase 6: extra-person surcharge inside price_hotel_stay only.
-- Requires 0191_rate_plan_occupancy_defaults.sql.
-- Room Type defaults are NEVER read here. Legacy NULL included_occupancy = no surcharge.

CREATE OR REPLACE FUNCTION public.price_hotel_stay(
  _restaurant_id uuid,
  _rate_plan_id uuid,
  _room_type_id uuid,
  _arrival date,
  _departure date,
  _rooms integer DEFAULT 1,
  _adults integer DEFAULT 1,
  _children integer DEFAULT 0,
  _infants integer DEFAULT 0,
  _quote_currency text DEFAULT NULL,
  _booking_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  plan public.hotel_rate_plans%ROWTYPE;
  night date;
  rate numeric(12,2);
  converted numeric(12,2);
  subtotal numeric(12,2) := 0;
  nights integer;
  rooms integer;
  lines jsonb := '[]'::jsonb;
  restriction public.hotel_rate_restrictions%ROWTYPE;
  fx numeric;
  quote_ccy text;
  advance integer;
  adults_n integer;
  children_n integer;
  included_n integer;
  adults_included integer;
  children_included integer;
  extra_adults integer;
  extra_children integer;
  occupancy_surcharge numeric(12,2);
BEGIN
  IF _departure <= _arrival THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;
  rooms := COALESCE(_rooms, 1);
  IF rooms < 1 THEN
    RAISE EXCEPTION 'ROOMS_INVALID';
  END IF;
  IF COALESCE(_adults, 1) < 1 THEN
    RAISE EXCEPTION 'OCCUPANCY_INVALID';
  END IF;
  IF COALESCE(_children, 0) < 0 OR COALESCE(_infants, 0) < 0 THEN
    RAISE EXCEPTION 'OCCUPANCY_INVALID';
  END IF;

  SELECT * INTO plan FROM public.hotel_rate_plans
  WHERE id = _rate_plan_id AND restaurant_id = _restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RATE_PLAN_NOT_FOUND';
  END IF;
  IF plan.active IS NOT TRUE THEN
    RAISE EXCEPTION 'RATE_PLAN_INACTIVE';
  END IF;
  IF _room_type_id IS NOT NULL AND plan.room_type_id <> _room_type_id THEN
    RAISE EXCEPTION 'RATE_PLAN_TYPE_MISMATCH';
  END IF;
  IF (plan.valid_from IS NOT NULL AND _arrival < plan.valid_from)
     OR (plan.valid_to IS NOT NULL AND (_departure - 1) > plan.valid_to) THEN
    RAISE EXCEPTION 'RATE_PLAN_OUT_OF_RANGE';
  END IF;

  advance := (_arrival - COALESCE(_booking_date, CURRENT_DATE));
  IF plan.min_advance_days IS NOT NULL AND advance < plan.min_advance_days THEN
    RAISE EXCEPTION 'ADVANCE_BOOKING_MIN_%', plan.min_advance_days;
  END IF;
  IF plan.max_advance_days IS NOT NULL AND advance > plan.max_advance_days THEN
    RAISE EXCEPTION 'ADVANCE_BOOKING_MAX_%', plan.max_advance_days;
  END IF;

  nights := (_departure - _arrival);

  -- Rate Plan occupancy fields only. Room Type Extra Guest Allowed is setup intent.
  adults_n := COALESCE(_adults, 1);
  children_n := COALESCE(_children, 0);
  extra_adults := 0;
  extra_children := 0;
  occupancy_surcharge := 0;
  IF plan.included_occupancy IS NOT NULL AND plan.included_occupancy >= 1 THEN
    included_n := plan.included_occupancy;
    adults_included := LEAST(adults_n, included_n);
    children_included := LEAST(children_n, included_n - adults_included);
    extra_adults := adults_n - adults_included;
    extra_children := children_n - children_included;
    occupancy_surcharge := round(
      (extra_adults * COALESCE(plan.extra_adult_rate, 0))
      + (extra_children * COALESCE(plan.extra_child_rate, 0)),
      2
    );
  END IF;

  SELECT * INTO restriction FROM public.hotel_rate_restrictions
  WHERE rate_plan_id = plan.id AND restriction_date = _arrival;
  IF FOUND THEN
    IF restriction.closed_to_arrival THEN
      RAISE EXCEPTION 'CLOSED_TO_ARRIVAL';
    END IF;
    IF restriction.min_stay IS NOT NULL AND nights < restriction.min_stay THEN
      RAISE EXCEPTION 'MIN_STAY_%', restriction.min_stay;
    END IF;
    IF restriction.max_stay IS NOT NULL AND nights > restriction.max_stay THEN
      RAISE EXCEPTION 'MAX_STAY_%', restriction.max_stay;
    END IF;
  END IF;

  SELECT * INTO restriction FROM public.hotel_rate_restrictions
  WHERE rate_plan_id = plan.id AND restriction_date = _departure;
  IF FOUND AND restriction.closed_to_departure THEN
    RAISE EXCEPTION 'CLOSED_TO_DEPARTURE';
  END IF;

  quote_ccy := COALESCE(NULLIF(btrim(_quote_currency), ''), plan.currency);
  fx := 1;
  IF quote_ccy <> plan.currency THEN
    SELECT r.rate INTO fx
      FROM public.pms_exchange_rates r
     WHERE r.restaurant_id = _restaurant_id
       AND r.quote_currency_code = quote_ccy
       AND r.effective_date <= COALESCE(_booking_date, CURRENT_DATE)
     ORDER BY r.effective_date DESC
     LIMIT 1;
    IF fx IS NULL THEN
      RAISE EXCEPTION 'FX_RATE_NOT_FOUND';
    END IF;
  END IF;

  night := _arrival;
  WHILE night < _departure LOOP
    SELECT * INTO restriction FROM public.hotel_rate_restrictions
    WHERE rate_plan_id = plan.id AND restriction_date = night;
    IF FOUND AND restriction.stop_sell THEN
      RAISE EXCEPTION 'STOP_SELL';
    END IF;

    SELECT c.nightly_rate INTO rate FROM public.hotel_rate_calendar c
    WHERE c.rate_plan_id = plan.id AND c.rate_date = night;
    IF rate IS NULL THEN
      rate := plan.base_rate;
    END IF;

    -- One nightly accommodation amount: effective night + occupancy surcharge.
    rate := rate + occupancy_surcharge;

    converted := round(rate * fx, 2) * rooms;
    subtotal := subtotal + converted;
    lines := lines || jsonb_build_object('date', to_char(night, 'YYYY-MM-DD'), 'rate', converted);
    rate := NULL;
    night := night + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'rate_plan_id', plan.id,
    'rate_plan_code', plan.code,
    'rate_plan_name', plan.name,
    'currency', quote_ccy,
    'nights', nights,
    'rooms', rooms,
    'adults', COALESCE(_adults, 1),
    'children', COALESCE(_children, 0),
    'infants', COALESCE(_infants, 0),
    'subtotal', subtotal,
    'nightly', lines,
    'fx_rate', fx
  );
END;
$$;

REVOKE ALL ON FUNCTION public.price_hotel_stay(uuid, uuid, uuid, date, date, integer, integer, integer, integer, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.price_hotel_stay(uuid, uuid, uuid, date, date, integer, integer, integer, integer, text, date) TO service_role;

COMMENT ON FUNCTION public.price_hotel_stay(uuid, uuid, uuid, date, date, integer, integer, integer, integer, text, date) IS
  'Canonical stay quote. Extra-person surcharge uses hotel_rate_plans.included_occupancy / extra_adult_rate / extra_child_rate only. Room Type defaults are not read. NULL included_occupancy keeps historical no-surcharge pricing.';
