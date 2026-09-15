-- PMS Create Reservation Phase 1 Section 7 — Guarantee + confirm (Issue #153).
-- Spec AC-CR7-1…24 (docs PR #150).
--
-- DATABASE IMPACT PLAN
-- New columns: YES — commercial_booking_source, market_segment,
-- external_reference, guarantee_method (all nullable text).
-- Do NOT overload hotel_reservations.source (channel origin:
-- staff | walk_in | direct_booking | future_online). Create INSERT still
-- hardcodes source = 'staff' (FO walk-in residual; leave documented).
-- RPC signature change: YES — replace SECURITY DEFINER
--   create_hotel_reservation
--   create_hotel_reservation_priced
-- with optional
--   _commercial_booking_source text DEFAULT NULL
--   _market_segment text DEFAULT NULL
--   _external_reference text DEFAULT NULL
--   _guarantee_method text DEFAULT NULL
-- so older callers (create_direct_booking 13-arg positional, FO walk-in)
-- keep resolving.
-- Dual-bind Company+TA from 0060 is PRESERVED (no DUAL_COMPANY_TA_NOT_ALLOWED).
-- No new tables. No sample seed. No payment-gateway table. No create-time
-- folio / deposit RPC. No email/SMS queue.
-- RLS model: UNCHANGED. Additive policies: NONE. Flag Abel: NOT required.
-- Receptionist residual PRESERVED (writer still requireReservationManager).
-- Requires 0060 applied first (dual-bind create_hotel_reservation).
-- Prod 0059/0060 remain Abel-gated residuals.
--
-- Dual-lane with drizzle/migrations/0061_pms_create_reservation_guarantee_confirm.sql
--
-- APPLY HELD — do not apply to non-prod or production from this agent.
-- Abel/PM apply after merge. Non-prod first, then production. Apply 0060 before 0061.
-- Until apply, Confirm that would claim persist of source/segment/ref/guarantee
-- must fail-closed in the writer (honest error). Pending and FO walk-in without
-- those fields omit the new params and keep working against the live signature.
-- After APPLY: persist source/segment/ref (+ guarantee if set) on every
-- successful create.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f supabase/migrations/0061_pms_create_reservation_guarantee_confirm.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.create_hotel_reservation_priced(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid, text, text, text, text);
--   DROP FUNCTION IF EXISTS public.create_hotel_reservation(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, text, text, text, text);
--   -- restore 0060 create_hotel_reservation + 0059 create_hotel_reservation_priced
--   ALTER TABLE public.hotel_reservations
--     DROP COLUMN IF EXISTS commercial_booking_source,
--     DROP COLUMN IF EXISTS market_segment,
--     DROP COLUMN IF EXISTS external_reference,
--     DROP COLUMN IF EXISTS guarantee_method;

ALTER TABLE public.hotel_reservations
  ADD COLUMN IF NOT EXISTS commercial_booking_source text,
  ADD COLUMN IF NOT EXISTS market_segment text,
  ADD COLUMN IF NOT EXISTS external_reference text,
  ADD COLUMN IF NOT EXISTS guarantee_method text;

COMMENT ON COLUMN public.hotel_reservations.commercial_booking_source IS
  'Staff commercial booking source (SET6 catalogue id or Section 1 default). Distinct from channel-origin source.';
COMMENT ON COLUMN public.hotel_reservations.market_segment IS
  'Staff market segment label (SET6 catalogue id or Section 1 default). Not a rate engine.';
COMMENT ON COLUMN public.hotel_reservations.external_reference IS
  'Optional external / GDS / file reference collected on create.';
COMMENT ON COLUMN public.hotel_reservations.guarantee_method IS
  'Recorded guarantee / tender class (pms_payment_methods.code or cashier PAYMENT_METHODS). Labels only — not a folio post or gateway.';

-- Postgres cannot CREATE OR REPLACE a changed argument list: drop old
-- signatures (0060/0059), then create the extended functions with DEFAULT NULL.

DROP FUNCTION IF EXISTS public.create_hotel_reservation_priced(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.create_hotel_reservation(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid);

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
  _membership_id uuid,
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
  next_number bigint;
  created public.hotel_reservations%ROWTYPE;
BEGIN
  IF _status NOT IN ('pending','confirmed') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  IF _company_master_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.guest_account_masters
      WHERE id = _company_master_id
        AND restaurant_id = _restaurant_id
        AND account_type = 'company'
    ) THEN
      RAISE EXCEPTION 'INVALID_COMPANY_MASTER';
    END IF;
  END IF;

  IF _travel_agent_master_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.guest_account_masters
      WHERE id = _travel_agent_master_id
        AND restaurant_id = _restaurant_id
        AND account_type = 'travel_agent'
    ) THEN
      RAISE EXCEPTION 'INVALID_TRAVEL_AGENT_MASTER';
    END IF;
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
    special_requests, notes, created_by_staff_membership_id,
    company_master_id, travel_agent_master_id,
    commercial_booking_source, market_segment, external_reference, guarantee_method
  ) VALUES (
    _restaurant_id, _guest_id, 'NR-' || lpad(next_number::text, 6, '0'), _arrival, _departure,
    _adults, _children, _room_type_id, _room_id, _status, 'staff',
    _special_requests, _notes, _membership_id,
    _company_master_id, _travel_agent_master_id,
    _commercial_booking_source, _market_segment, _external_reference, _guarantee_method
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
      'status', created.status,
      'company_master_id', created.company_master_id,
      'travel_agent_master_id', created.travel_agent_master_id,
      'commercial_booking_source', created.commercial_booking_source,
      'market_segment', created.market_segment,
      'external_reference', created.external_reference,
      'guarantee_method', created.guarantee_method
    ),
    _membership_id
  );

  RETURN created;
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
  _membership_id uuid,
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
  pricing jsonb;
BEGIN
  created := public.create_hotel_reservation(
    _restaurant_id, _guest_id, _room_type_id, _room_id, _arrival, _departure,
    _adults, _children, _special_requests, _notes, _status, _membership_id,
    _company_master_id, _travel_agent_master_id,
    _commercial_booking_source, _market_segment, _external_reference, _guarantee_method
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

REVOKE ALL ON FUNCTION public.create_hotel_reservation(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_hotel_reservation(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.create_hotel_reservation_priced(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_hotel_reservation_priced(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid, text, text, text, text) TO service_role;
