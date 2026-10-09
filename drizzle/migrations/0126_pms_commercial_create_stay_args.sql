-- Forward current stay arguments through commercial reservation create.
--
-- Sequential after 0125. Dual-lane: byte-identical copies live in
--   supabase/migrations/0126_pms_commercial_create_stay_args.sql
--   drizzle/migrations/0126_pms_commercial_create_stay_args.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- 0116 added _rooms, _infants, and _quote_currency to create_hotel_reservation_priced.
-- 0106 create_hotel_reservation_priced_commercial did not accept or forward them.
-- Package and promotion sync behavior is unchanged.
--
-- Rollback:
--   Restore the 0106 function body (without _rooms, _infants, _quote_currency).

DROP FUNCTION IF EXISTS public.create_hotel_reservation_priced_commercial(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid[], uuid, uuid, text, text, text, text
);

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
  _promotion_activation_id uuid DEFAULT NULL,
  _package_activation_ids uuid[] DEFAULT NULL,
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
BEGIN
  created := public.create_hotel_reservation_priced(
    _restaurant_id, _guest_id, _room_type_id, _room_id, _arrival, _departure,
    _adults, _children, _special_requests, _notes, _status, _rate_plan_id, _membership_id,
    _company_master_id, _travel_agent_master_id,
    _commercial_booking_source, _market_segment, _external_reference, _guarantee_method,
    _rooms, _infants, _quote_currency
  );

  IF _promotion_activation_id IS NOT NULL THEN
    PERFORM public.sync_hotel_reservation_promotion(
      _restaurant_id, created.id, _promotion_activation_id, 'apply'
    );
  END IF;

  IF _package_activation_ids IS NOT NULL THEN
    PERFORM public.sync_hotel_reservation_packages(
      _restaurant_id, created.id, _package_activation_ids, 'apply'
    );
  END IF;

  SELECT * INTO created FROM public.hotel_reservations WHERE id = created.id;
  RETURN created;
END;
$$;

REVOKE ALL ON FUNCTION public.create_hotel_reservation_priced_commercial(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid[], uuid, uuid, text, text, text, text, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_hotel_reservation_priced_commercial(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid[], uuid, uuid, text, text, text, text, integer, integer, text) TO service_role;
