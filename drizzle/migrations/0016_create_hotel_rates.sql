-- Phase 6G — Rates & Revenue Management. Tenant-scoped, owner/manager only.

ALTER TABLE public.hotel_reservation_history DROP CONSTRAINT hotel_reservation_history_event_check;
ALTER TABLE public.hotel_reservation_history ADD CONSTRAINT hotel_reservation_history_event_check
  CHECK (event_type IN (
    'created','confirmed','amended','cancelled','room_assigned','room_changed','status_changed',
    'check_in','check_out','room_moved','stay_extended','stay_shortened','no_show','repriced'
  ));

CREATE TABLE public.hotel_rate_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_by_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_rate_categories_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_rate_categories_code_unique UNIQUE (restaurant_id, code)
);

GRANT SELECT, INSERT, UPDATE ON public.hotel_rate_categories TO authenticated;
GRANT ALL ON public.hotel_rate_categories TO service_role;
ALTER TABLE public.hotel_rate_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read rate categories" ON public.hotel_rate_categories
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers insert rate categories" ON public.hotel_rate_categories
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers update rate categories" ON public.hotel_rate_categories
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TRIGGER set_hotel_rate_categories_updated_at BEFORE UPDATE ON public.hotel_rate_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.hotel_rate_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  rate_category_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  currency text NOT NULL,
  base_rate numeric(12,2) NOT NULL,
  valid_from date,
  valid_to date,
  active boolean NOT NULL DEFAULT true,
  created_by_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_rate_plans_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_rate_plans_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT hotel_rate_plans_base_rate_check CHECK (base_rate >= 0),
  CONSTRAINT hotel_rate_plans_validity_check CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT hotel_rate_plans_category_same_property FOREIGN KEY (rate_category_id, restaurant_id)
    REFERENCES public.hotel_rate_categories(id, restaurant_id),
  CONSTRAINT hotel_rate_plans_type_same_property FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types(id, restaurant_id)
);

CREATE INDEX hotel_rate_plans_type_idx ON public.hotel_rate_plans(restaurant_id, room_type_id, active);

GRANT SELECT, INSERT, UPDATE ON public.hotel_rate_plans TO authenticated;
GRANT ALL ON public.hotel_rate_plans TO service_role;
ALTER TABLE public.hotel_rate_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read rate plans" ON public.hotel_rate_plans
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers insert rate plans" ON public.hotel_rate_plans
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers update rate plans" ON public.hotel_rate_plans
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TRIGGER set_hotel_rate_plans_updated_at BEFORE UPDATE ON public.hotel_rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.hotel_rate_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  rate_plan_id uuid NOT NULL,
  rate_date date NOT NULL,
  nightly_rate numeric(12,2) NOT NULL,
  created_by_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_rate_calendar_unique UNIQUE (rate_plan_id, rate_date),
  CONSTRAINT hotel_rate_calendar_rate_check CHECK (nightly_rate >= 0),
  CONSTRAINT hotel_rate_calendar_plan_same_property FOREIGN KEY (rate_plan_id, restaurant_id)
    REFERENCES public.hotel_rate_plans(id, restaurant_id) ON DELETE CASCADE
);

CREATE INDEX hotel_rate_calendar_lookup_idx ON public.hotel_rate_calendar(restaurant_id, rate_plan_id, rate_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_rate_calendar TO authenticated;
GRANT ALL ON public.hotel_rate_calendar TO service_role;
ALTER TABLE public.hotel_rate_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read rate calendar" ON public.hotel_rate_calendar
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers write rate calendar" ON public.hotel_rate_calendar
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers update rate calendar" ON public.hotel_rate_calendar
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers delete rate calendar" ON public.hotel_rate_calendar
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TRIGGER set_hotel_rate_calendar_updated_at BEFORE UPDATE ON public.hotel_rate_calendar
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.hotel_rate_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  rate_plan_id uuid NOT NULL,
  restriction_date date NOT NULL,
  min_stay integer,
  max_stay integer,
  closed_to_arrival boolean NOT NULL DEFAULT false,
  closed_to_departure boolean NOT NULL DEFAULT false,
  stop_sell boolean NOT NULL DEFAULT false,
  created_by_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_rate_restrictions_unique UNIQUE (rate_plan_id, restriction_date),
  CONSTRAINT hotel_rate_restrictions_stay_check CHECK (
    (min_stay IS NULL OR min_stay >= 1)
    AND (max_stay IS NULL OR max_stay >= 1)
    AND (min_stay IS NULL OR max_stay IS NULL OR max_stay >= min_stay)
  ),
  CONSTRAINT hotel_rate_restrictions_plan_same_property FOREIGN KEY (rate_plan_id, restaurant_id)
    REFERENCES public.hotel_rate_plans(id, restaurant_id) ON DELETE CASCADE
);

CREATE INDEX hotel_rate_restrictions_lookup_idx
  ON public.hotel_rate_restrictions(restaurant_id, rate_plan_id, restriction_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_rate_restrictions TO authenticated;
GRANT ALL ON public.hotel_rate_restrictions TO service_role;
ALTER TABLE public.hotel_rate_restrictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read rate restrictions" ON public.hotel_rate_restrictions
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers insert rate restrictions" ON public.hotel_rate_restrictions
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers update rate restrictions" ON public.hotel_rate_restrictions
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers delete rate restrictions" ON public.hotel_rate_restrictions
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TRIGGER set_hotel_rate_restrictions_updated_at BEFORE UPDATE ON public.hotel_rate_restrictions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.hotel_reservations
  ADD COLUMN rate_plan_id uuid,
  ADD COLUMN currency text,
  ADD COLUMN room_subtotal numeric(12,2),
  ADD COLUMN nightly_rate_snapshot jsonb,
  ADD COLUMN priced_at timestamptz;

ALTER TABLE public.hotel_reservations
  ADD CONSTRAINT hotel_reservations_rate_plan_same_property FOREIGN KEY (rate_plan_id, restaurant_id)
    REFERENCES public.hotel_rate_plans(id, restaurant_id);

CREATE OR REPLACE FUNCTION public.price_hotel_stay(
  _restaurant_id uuid,
  _rate_plan_id uuid,
  _room_type_id uuid,
  _arrival date,
  _departure date
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
  subtotal numeric(12,2) := 0;
  nights integer;
  lines jsonb := '[]'::jsonb;
  restriction public.hotel_rate_restrictions%ROWTYPE;
BEGIN
  IF _departure <= _arrival THEN
    RAISE EXCEPTION 'INVALID_DATES';
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

  nights := (_departure - _arrival);

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

    subtotal := subtotal + rate;
    lines := lines || jsonb_build_object('date', to_char(night, 'YYYY-MM-DD'), 'rate', rate);
    rate := NULL;
    night := night + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'rate_plan_id', plan.id,
    'rate_plan_code', plan.code,
    'rate_plan_name', plan.name,
    'currency', plan.currency,
    'nights', nights,
    'subtotal', subtotal,
    'nightly', lines
  );
END;
$$;

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
  _membership_id uuid
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  created public.hotel_reservations%ROWTYPE;
  pricing jsonb;
BEGIN
  created := public.create_hotel_reservation(
    _restaurant_id, _guest_id, _room_type_id, _room_id, _arrival, _departure,
    _adults, _children, _special_requests, _notes, _status, _membership_id
  );

  IF _rate_plan_id IS NOT NULL THEN
    pricing := public.price_hotel_stay(_restaurant_id, _rate_plan_id, _room_type_id, _arrival, _departure);

    UPDATE public.hotel_reservations
    SET rate_plan_id = _rate_plan_id,
        currency = pricing->>'currency',
        room_subtotal = (pricing->>'subtotal')::numeric,
        nightly_rate_snapshot = pricing->'nightly',
        priced_at = now()
    WHERE id = created.id
    RETURNING * INTO created;
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

  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.price_hotel_stay(uuid, uuid, uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_hotel_reservation_priced(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.amend_hotel_reservation_priced(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reprice_hotel_reservation(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.price_hotel_stay(uuid, uuid, uuid, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_hotel_reservation_priced(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.amend_hotel_reservation_priced(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reprice_hotel_reservation(uuid, uuid, uuid, uuid) TO service_role;