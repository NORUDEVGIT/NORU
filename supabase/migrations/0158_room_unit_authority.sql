-- STAY-08G: hotel_reservation_rooms is the room authority.
-- Master room columns that remain are aggregates or a compatibility pointer.
-- Nothing in this file drops a column. There is no CASCADE.
-- Apply 0153 through 0157 before this file.

CREATE OR REPLACE FUNCTION public.sync_reservation_room_total(
  _restaurant_id uuid,
  _reservation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  unit_count integer;
  active_count integer;
  total numeric;
  next_currency text;
  currency_count integer;
  next_nightly jsonb;
  any_priced boolean;
  next_adults integer;
  next_children integer;
  next_infants integer;
  pointer_room uuid;
  pointer_type uuid;
  pointer_plan uuid;
BEGIN
  SELECT count(*) INTO unit_count
  FROM public.hotel_reservation_rooms
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id;

  IF COALESCE(unit_count, 0) = 0 THEN
    RETURN;
  END IF;

  SELECT unit.room_id, unit.room_type_id, unit.rate_plan_id
    INTO pointer_room, pointer_type, pointer_plan
  FROM public.hotel_reservation_rooms unit
  WHERE unit.restaurant_id = _restaurant_id
    AND unit.reservation_id = _reservation_id
  ORDER BY unit.unit_sequence
  LIMIT 1;

  -- Compatibility pointer only. Operational readers use the unit rows.
  UPDATE public.hotel_reservations
     SET room_id = pointer_room,
         room_type_id = pointer_type,
         rate_plan_id = pointer_plan
   WHERE id = _reservation_id
     AND restaurant_id = _restaurant_id;

  SELECT
    count(*),
    COALESCE(sum(unit.adults), 0),
    COALESCE(sum(unit.children), 0),
    COALESCE(sum(unit.infants), 0),
    sum(unit.room_subtotal),
    count(DISTINCT unit.currency) FILTER (WHERE unit.currency IS NOT NULL),
    (array_agg(unit.currency ORDER BY unit.unit_sequence) FILTER (WHERE unit.currency IS NOT NULL))[1],
    bool_or(unit.priced_at IS NOT NULL)
  INTO active_count, next_adults, next_children, next_infants, total,
       currency_count, next_currency, any_priced
  FROM public.hotel_reservation_rooms unit
  WHERE unit.restaurant_id = _restaurant_id
    AND unit.reservation_id = _reservation_id
    AND unit.status NOT IN ('cancelled', 'no_show');

  IF COALESCE(active_count, 0) = 0 THEN
    RETURN;
  END IF;

  IF active_count = 1 THEN
    SELECT unit.nightly_rate_snapshot
      INTO next_nightly
    FROM public.hotel_reservation_rooms unit
    WHERE unit.restaurant_id = _restaurant_id
      AND unit.reservation_id = _reservation_id
      AND unit.status NOT IN ('cancelled', 'no_show')
    ORDER BY unit.unit_sequence
    LIMIT 1;
  ELSE
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('date', night.night, 'rate', night.rate)
        ORDER BY night.night
      ),
      '[]'::jsonb
    )
    INTO next_nightly
    FROM (
      SELECT line->>'date' AS night, sum((line->>'rate')::numeric) AS rate
      FROM public.hotel_reservation_rooms unit
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(unit.nightly_rate_snapshot) = 'array' THEN unit.nightly_rate_snapshot
          ELSE '[]'::jsonb
        END
      ) AS line
      WHERE unit.restaurant_id = _restaurant_id
        AND unit.reservation_id = _reservation_id
        AND unit.status NOT IN ('cancelled', 'no_show')
      GROUP BY line->>'date'
    ) AS night;
  END IF;

  UPDATE public.hotel_reservations
     SET adults = GREATEST(next_adults, 1),
         children = GREATEST(next_children, 0),
         infants = GREATEST(next_infants, 0),
         rooms_requested = GREATEST(active_count, 1),
         room_subtotal = total,
         nightly_rate_snapshot = next_nightly,
         priced_at = CASE WHEN any_priced THEN now() ELSE priced_at END,
         currency = CASE
           WHEN currency_count = 1 THEN COALESCE(next_currency, currency)
           ELSE currency
         END
   WHERE id = _reservation_id
     AND restaurant_id = _restaurant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.hotel_reservation_rooms_sync_master()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  property uuid;
  reservation uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    property := OLD.restaurant_id;
    reservation := OLD.reservation_id;
  ELSE
    property := NEW.restaurant_id;
    reservation := NEW.reservation_id;
  END IF;
  PERFORM public.sync_reservation_room_total(property, reservation);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS hotel_reservation_rooms_sync_master ON public.hotel_reservation_rooms;

CREATE CONSTRAINT TRIGGER hotel_reservation_rooms_sync_master
  AFTER INSERT OR UPDATE OR DELETE ON public.hotel_reservation_rooms
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.hotel_reservation_rooms_sync_master();

COMMENT ON COLUMN public.hotel_reservations.room_id IS
  'Compatibility pointer copied from hotel_reservation_rooms unit_sequence 1. Not operational room authority.';
COMMENT ON COLUMN public.hotel_reservations.room_type_id IS
  'Compatibility pointer copied from hotel_reservation_rooms unit_sequence 1. A booking may contain other room types.';
COMMENT ON COLUMN public.hotel_reservations.rate_plan_id IS
  'Compatibility pointer copied from hotel_reservation_rooms unit_sequence 1. Not the only rate plan on the booking.';
COMMENT ON COLUMN public.hotel_reservations.nightly_rate_snapshot IS
  'Aggregate of active room-unit nightly rates. One active unit copies that unit snapshot.';
COMMENT ON COLUMN public.hotel_reservations.rooms_requested IS
  'Mirror of the active room-unit count. Not an inventory allocation.';
COMMENT ON COLUMN public.hotel_reservations.adults IS
  'Sum of adults on active room units.';
COMMENT ON COLUMN public.hotel_reservations.children IS
  'Sum of children on active room units.';
COMMENT ON COLUMN public.hotel_reservations.infants IS
  'Sum of infants on active room units.';
COMMENT ON COLUMN public.hotel_reservations.room_subtotal IS
  'Sum of room_subtotal on active room units. One folio still belongs to the booking.';
COMMENT ON COLUMN public.hotel_reservations.priced_at IS
  'Latest time the active room-unit aggregate was priced.';
COMMENT ON COLUMN public.hotel_reservations.currency IS
  'Booking currency. Updated only when every active room unit shares one currency.';

REVOKE ALL ON FUNCTION public.hotel_reservation_rooms_sync_master() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hotel_reservation_rooms_sync_master() TO service_role;
