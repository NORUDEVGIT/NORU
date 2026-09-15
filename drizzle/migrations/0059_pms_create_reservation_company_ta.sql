-- PMS Create Reservation Phase 1 Section 2 — Company / TA on create (Issue #127).
-- Spec AC-CR2-1…18. Closes AC-W4-5 for create (not detail-only).
--
-- DATABASE IMPACT PLAN
-- New columns: NONE. hotel_reservations.company_master_id and
-- travel_agent_master_id already exist (Wave 4 / 0053).
-- RPC signature change: YES — replace SECURITY DEFINER
--   create_hotel_reservation
--   create_hotel_reservation_priced
-- with optional _company_master_id / _travel_agent_master_id (uuid, nullable).
-- Same-property FK already on the columns. RPC validates account_type.
-- Dual Company+TA on one create is rejected (mode exclusive).
-- No new tables. No parallel guest / master APIs.
-- RLS model: UNCHANGED. Additive policies: NONE. Flag Abel: NOT required.
-- Receptionist residual PRESERVED (writer still requireReservationManager).
--
-- Dual-lane with drizzle/migrations/0059_pms_create_reservation_company_ta.sql
--
-- APPLY HELD — do not apply to non-prod or production from this agent.
-- Abel/PM apply after merge. Non-prod first, then production.
-- Until apply, create without master IDs keeps working (params omitted).
-- Create with a selected Company/TA fails closed until this RPC is applied.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f supabase/migrations/0059_pms_create_reservation_company_ta.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.create_hotel_reservation_priced(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid);
--   DROP FUNCTION IF EXISTS public.create_hotel_reservation(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid);
--   -- restore 13-arg priced + 12-arg create from
--   -- supabase/migrations/20260908_noru_greenfield_schema.sql
--   -- (create_hotel_reservation / create_hotel_reservation_priced).

-- Postgres cannot CREATE OR REPLACE a changed argument list: drop old
-- signatures, then create the extended functions with DEFAULT NULL so
-- create_direct_booking's 13-arg positional call still resolves.

DROP FUNCTION IF EXISTS public.create_hotel_reservation_priced(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.create_hotel_reservation(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid);

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
  _travel_agent_master_id uuid DEFAULT NULL
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

  IF _company_master_id IS NOT NULL AND _travel_agent_master_id IS NOT NULL THEN
    RAISE EXCEPTION 'DUAL_COMPANY_TA_NOT_ALLOWED';
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
    company_master_id, travel_agent_master_id
  ) VALUES (
    _restaurant_id, _guest_id, 'NR-' || lpad(next_number::text, 6, '0'), _arrival, _departure,
    _adults, _children, _room_type_id, _room_id, _status, 'staff',
    _special_requests, _notes, _membership_id,
    _company_master_id, _travel_agent_master_id
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
      'travel_agent_master_id', created.travel_agent_master_id
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
  _travel_agent_master_id uuid DEFAULT NULL
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
    _company_master_id, _travel_agent_master_id
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

REVOKE ALL ON FUNCTION public.create_hotel_reservation(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_hotel_reservation(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.create_hotel_reservation_priced(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_hotel_reservation_priced(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid) TO service_role;
