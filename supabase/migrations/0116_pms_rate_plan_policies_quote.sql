-- Rate plan cancellation/refundability masters, advance-booking, occupancy/FX quote.
--
-- Sequential after 0115. Dual-lane: byte-identical copies live in
--   supabase/migrations/0116_pms_rate_plan_policies_quote.sql
--   drizzle/migrations/0116_pms_rate_plan_policies_quote.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0116_pms_rate_plan_policies_quote.sql
--   Do not run both copies against the same database.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.price_hotel_stay(uuid, uuid, uuid, date, date, integer, integer, integer, integer, text, date);
--   Restore prior price_hotel_stay(uuid, uuid, uuid, date, date) from 0016.
--   ALTER TABLE public.hotel_reservations
--     DROP COLUMN IF EXISTS rooms_requested,
--     DROP COLUMN IF EXISTS infants,
--     DROP COLUMN IF EXISTS cancellation_policy_snapshot,
--     DROP COLUMN IF EXISTS refundability_snapshot;
--   ALTER TABLE public.hotel_rate_plans
--     DROP CONSTRAINT IF EXISTS hotel_rate_plans_cancellation_policy_fk,
--     DROP CONSTRAINT IF EXISTS hotel_rate_plans_refundability_fk,
--     DROP COLUMN IF EXISTS cancellation_policy_id,
--     DROP COLUMN IF EXISTS refundability_id,
--     DROP COLUMN IF EXISTS min_advance_days,
--     DROP COLUMN IF EXISTS max_advance_days;
--   DROP TABLE IF EXISTS public.pms_rate_refundability_codes;
--   DROP TABLE IF EXISTS public.pms_rate_cancellation_policies;
--
-- Does not reuse restaurants.fo_cancel_fee_* / fo_noshow_fee_*.
-- Does not add meal_plan or min_stay onto hotel_rate_plans.
-- No seed.

CREATE TABLE IF NOT EXISTS public.pms_rate_cancellation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  deadline_hours integer,
  penalty_type text NOT NULL DEFAULT 'none',
  penalty_value numeric(12,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_rate_cancellation_policies_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_rate_cancellation_policies_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_rate_cancellation_policies_code_check CHECK (code ~ '^[A-Z0-9_]{1,20}$'),
  CONSTRAINT pms_rate_cancellation_policies_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT pms_rate_cancellation_policies_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  ),
  CONSTRAINT pms_rate_cancellation_policies_deadline_check CHECK (
    deadline_hours IS NULL OR deadline_hours >= 0
  ),
  CONSTRAINT pms_rate_cancellation_policies_penalty_type_check CHECK (
    penalty_type IN ('none', 'percent', 'nights', 'fixed')
  ),
  CONSTRAINT pms_rate_cancellation_policies_penalty_value_check CHECK (penalty_value >= 0)
);

CREATE INDEX IF NOT EXISTS pms_rate_cancellation_policies_restaurant_idx
  ON public.pms_rate_cancellation_policies(restaurant_id, code);

COMMENT ON TABLE public.pms_rate_cancellation_policies IS
  'Guest-facing rate cancellation catalogue. Not FO cancel fee defaults and not a folio posting rule.';

CREATE TABLE IF NOT EXISTS public.pms_rate_refundability_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  kind text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_rate_refundability_codes_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_rate_refundability_codes_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_rate_refundability_codes_code_check CHECK (code ~ '^[A-Z0-9_]{1,20}$'),
  CONSTRAINT pms_rate_refundability_codes_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT pms_rate_refundability_codes_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  ),
  CONSTRAINT pms_rate_refundability_codes_kind_check CHECK (
    kind IN ('refundable', 'non_refundable', 'partial')
  )
);

CREATE INDEX IF NOT EXISTS pms_rate_refundability_codes_restaurant_idx
  ON public.pms_rate_refundability_codes(restaurant_id, code);

COMMENT ON TABLE public.pms_rate_refundability_codes IS
  'Reusable refundability labels attached to rate plans. Not a cashiering refund RPC.';

ALTER TABLE public.hotel_rate_plans
  ADD COLUMN IF NOT EXISTS cancellation_policy_id uuid,
  ADD COLUMN IF NOT EXISTS refundability_id uuid,
  ADD COLUMN IF NOT EXISTS min_advance_days integer,
  ADD COLUMN IF NOT EXISTS max_advance_days integer;

ALTER TABLE public.hotel_rate_plans
  DROP CONSTRAINT IF EXISTS hotel_rate_plans_advance_range_check;
ALTER TABLE public.hotel_rate_plans
  ADD CONSTRAINT hotel_rate_plans_advance_range_check CHECK (
    (min_advance_days IS NULL OR min_advance_days >= 0)
    AND (max_advance_days IS NULL OR max_advance_days >= 0)
    AND (
      min_advance_days IS NULL
      OR max_advance_days IS NULL
      OR max_advance_days >= min_advance_days
    )
  );

ALTER TABLE public.hotel_rate_plans
  DROP CONSTRAINT IF EXISTS hotel_rate_plans_cancellation_policy_fk;
ALTER TABLE public.hotel_rate_plans
  ADD CONSTRAINT hotel_rate_plans_cancellation_policy_fk
  FOREIGN KEY (cancellation_policy_id, restaurant_id)
  REFERENCES public.pms_rate_cancellation_policies (id, restaurant_id)
  ON DELETE SET NULL;

ALTER TABLE public.hotel_rate_plans
  DROP CONSTRAINT IF EXISTS hotel_rate_plans_refundability_fk;
ALTER TABLE public.hotel_rate_plans
  ADD CONSTRAINT hotel_rate_plans_refundability_fk
  FOREIGN KEY (refundability_id, restaurant_id)
  REFERENCES public.pms_rate_refundability_codes (id, restaurant_id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.hotel_rate_plans.cancellation_policy_id IS
  'FK to property cancellation catalogue. Guest merchandising, not restaurants.fo_cancel_fee_*.';
COMMENT ON COLUMN public.hotel_rate_plans.min_advance_days IS
  'Minimum days between booking date and arrival. Enforced by price_hotel_stay.';

ALTER TABLE public.hotel_reservations
  ADD COLUMN IF NOT EXISTS rooms_requested integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS infants integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_policy_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS refundability_snapshot jsonb;

ALTER TABLE public.hotel_reservations
  DROP CONSTRAINT IF EXISTS hotel_reservations_rooms_requested_check;
ALTER TABLE public.hotel_reservations
  ADD CONSTRAINT hotel_reservations_rooms_requested_check CHECK (rooms_requested >= 1);
ALTER TABLE public.hotel_reservations
  DROP CONSTRAINT IF EXISTS hotel_reservations_infants_check;
ALTER TABLE public.hotel_reservations
  ADD CONSTRAINT hotel_reservations_infants_check CHECK (infants >= 0);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_rate_cancellation_policies TO authenticated;
GRANT ALL ON public.pms_rate_cancellation_policies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_rate_refundability_codes TO authenticated;
GRANT ALL ON public.pms_rate_refundability_codes TO service_role;

ALTER TABLE public.pms_rate_cancellation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_rate_refundability_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read pms rate cancellation policies" ON public.pms_rate_cancellation_policies;
CREATE POLICY "Members read pms rate cancellation policies" ON public.pms_rate_cancellation_policies
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms rate cancellation policies" ON public.pms_rate_cancellation_policies;
CREATE POLICY "Managers insert pms rate cancellation policies" ON public.pms_rate_cancellation_policies
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms rate cancellation policies" ON public.pms_rate_cancellation_policies;
CREATE POLICY "Managers update pms rate cancellation policies" ON public.pms_rate_cancellation_policies
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms rate cancellation policies" ON public.pms_rate_cancellation_policies;
CREATE POLICY "Managers delete pms rate cancellation policies" ON public.pms_rate_cancellation_policies
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read pms rate refundability codes" ON public.pms_rate_refundability_codes;
CREATE POLICY "Members read pms rate refundability codes" ON public.pms_rate_refundability_codes
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms rate refundability codes" ON public.pms_rate_refundability_codes;
CREATE POLICY "Managers insert pms rate refundability codes" ON public.pms_rate_refundability_codes
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms rate refundability codes" ON public.pms_rate_refundability_codes;
CREATE POLICY "Managers update pms rate refundability codes" ON public.pms_rate_refundability_codes
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms rate refundability codes" ON public.pms_rate_refundability_codes;
CREATE POLICY "Managers delete pms rate refundability codes" ON public.pms_rate_refundability_codes
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_rate_cancellation_policies_updated_at ON public.pms_rate_cancellation_policies;
CREATE TRIGGER set_pms_rate_cancellation_policies_updated_at
  BEFORE UPDATE ON public.pms_rate_cancellation_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pms_rate_refundability_codes_updated_at ON public.pms_rate_refundability_codes;
CREATE TRIGGER set_pms_rate_refundability_codes_updated_at
  BEFORE UPDATE ON public.pms_rate_refundability_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP FUNCTION IF EXISTS public.price_hotel_stay(uuid, uuid, uuid, date, date);

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

DROP FUNCTION IF EXISTS public.create_hotel_reservation_priced(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid, text, text, text, text
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
  _quote_currency text DEFAULT NULL
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

  RETURN created;
END;
$$;

REVOKE ALL ON FUNCTION public.create_hotel_reservation_priced(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_hotel_reservation_priced(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, text) TO service_role;

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
