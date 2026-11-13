-- Reservation RPC execute grants.
--
-- The project default privileges grant EXECUTE on every new public function to
-- anon and authenticated. These SECURITY DEFINER reservation writers were
-- created or recreated without revoking those defaults, so a browser session,
-- or an unauthenticated caller with the anon key, could invoke them through
-- the Data API with arbitrary property and reservation ids.
--
-- The application calls every one of them only from server functions through
-- the service_role client, and the database calls them only from other
-- SECURITY DEFINER functions owned by postgres. Restricting EXECUTE to
-- service_role (the owner keeps its implicit right) matches the other
-- reservation, check-in, move and assignment writers.
--
-- Grants only. Definitions, signatures, RLS and business rules are unchanged.
--
-- Dual-lane: drizzle/migrations and supabase/migrations copies must match.

REVOKE ALL ON FUNCTION public.create_hotel_reservation(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid,
  uuid, uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_hotel_reservation(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid,
  uuid, uuid, text, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.create_hotel_reservation_priced(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid,
  uuid, uuid, uuid, text, text, text, text, integer, integer, text, jsonb, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_hotel_reservation_priced(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid,
  uuid, uuid, uuid, text, text, text, text, integer, integer, text, jsonb, text, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.create_hotel_reservation_priced_commercial(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid,
  uuid, uuid, uuid[], uuid, uuid, text, text, text, text, integer, integer, text,
  jsonb, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_hotel_reservation_priced_commercial(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid,
  uuid, uuid, uuid[], uuid, uuid, text, text, text, text, integer, integer, text,
  jsonb, text, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.amend_hotel_reservation_priced(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, uuid, uuid, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.amend_hotel_reservation_priced(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, uuid, uuid, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.assign_hotel_reservation_room_unit(
  uuid, uuid, uuid, uuid, uuid, uuid, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_hotel_reservation_room_unit(
  uuid, uuid, uuid, uuid, uuid, uuid, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.change_hotel_stay_dates(uuid, uuid, date, date, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_hotel_stay_dates(uuid, uuid, date, date, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.sync_hotel_reservation_packages(uuid, uuid, uuid[], text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_hotel_reservation_packages(uuid, uuid, uuid[], text)
  TO service_role;

REVOKE ALL ON FUNCTION public.sync_hotel_reservation_promotion(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_hotel_reservation_promotion(uuid, uuid, uuid, text)
  TO service_role;
