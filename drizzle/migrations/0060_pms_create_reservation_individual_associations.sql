-- PMS Create Reservation Individual Associations — dual-bind lift (Issue #138).
-- Spec AC-CR2A-1…15. Does NOT reopen #127. AC-CR2-1…18 stand as prior lock.
--
-- DATABASE IMPACT PLAN
-- New columns: NONE. hotel_reservations.company_master_id and
-- travel_agent_master_id already exist (Wave 4 / 0053).
-- RPC signature change: NONE — same optional _company_master_id /
-- _travel_agent_master_id params as 0059.
-- RPC body change: YES — replace SECURITY DEFINER create_hotel_reservation
-- to allow Company AND Travel Agency together (remove DUAL_COMPANY_TA_NOT_ALLOWED).
-- create_hotel_reservation_priced is unchanged (already forwards both params).
-- Requires 0059 applied first (optional master-id params).
-- No new tables. No parallel guest / master APIs.
-- RLS model: UNCHANGED. Additive policies: NONE. Flag Abel: NOT required.
-- Receptionist residual PRESERVED (writer still requireReservationManager).
-- Prod 0059 remains Abel-gated residual; this 0060 is a separate APPLY after 0059.
--
-- Dual-lane with drizzle/migrations/0060_pms_create_reservation_individual_associations.sql
--
-- APPLY HELD — do not apply to non-prod or production from this agent.
-- Abel/PM apply after merge. Non-prod first, then production. Apply 0059 before 0060.
-- Until apply, Zod no longer rejects both; RPC still fail-closes with
-- DUAL_COMPANY_TA_NOT_ALLOWED if only 0059 is live.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f supabase/migrations/0060_pms_create_reservation_individual_associations.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   re-apply supabase/migrations/0059_pms_create_reservation_company_ta.sql
--   (restores DUAL_COMPANY_TA_NOT_ALLOWED).

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
