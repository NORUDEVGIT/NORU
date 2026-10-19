-- B01.2 — one live fo_checkin_progress row per room unit.
-- A null reservation_room_id remains only for a stay with no hotel_reservation_rooms rows.
-- A stay with exactly one unit is attached to that unit.
-- A stay with several units keeps its existing row for audit and does not copy
-- waivers or completed_at onto any sibling. Live reads ignore that null row.
-- Dual-lane with drizzle/migrations/0169_fo_checkin_progress_unit.sql.
-- Do not apply from an agent.

ALTER TABLE public.fo_checkin_progress
  ADD COLUMN IF NOT EXISTS reservation_room_id uuid;

ALTER TABLE public.fo_checkin_progress
  DROP CONSTRAINT IF EXISTS fo_checkin_progress_room_same_property;

ALTER TABLE public.fo_checkin_progress
  ADD CONSTRAINT fo_checkin_progress_room_same_property
  FOREIGN KEY (reservation_room_id, restaurant_id)
  REFERENCES public.hotel_reservation_rooms (id, restaurant_id)
  ON DELETE CASCADE;

ALTER TABLE public.fo_checkin_progress
  DROP CONSTRAINT IF EXISTS fo_checkin_progress_reservation_unique;

ALTER TABLE public.fo_checkin_progress
  DROP CONSTRAINT IF EXISTS fo_checkin_progress_reservation_unit_unique;

ALTER TABLE public.fo_checkin_progress
  ADD CONSTRAINT fo_checkin_progress_reservation_unit_unique
  UNIQUE NULLS NOT DISTINCT (reservation_id, reservation_room_id);

-- Attach only when the reservation has exactly one unit. Do not insert rows.
UPDATE public.fo_checkin_progress AS progress
SET reservation_room_id = unit.id
FROM public.hotel_reservation_rooms AS unit
WHERE progress.reservation_room_id IS NULL
  AND progress.reservation_id = unit.reservation_id
  AND progress.restaurant_id = unit.restaurant_id
  AND (
    SELECT count(*)
    FROM public.hotel_reservation_rooms AS counted
    WHERE counted.reservation_id = progress.reservation_id
      AND counted.restaurant_id = progress.restaurant_id
  ) = 1;

CREATE OR REPLACE FUNCTION public.fo_checkin_progress_require_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  unit_count integer;
BEGIN
  IF NEW.reservation_room_id IS NULL THEN
    SELECT count(*) INTO unit_count
    FROM public.hotel_reservation_rooms
    WHERE reservation_id = NEW.reservation_id
      AND restaurant_id = NEW.restaurant_id;
    IF unit_count > 0 THEN
      RAISE EXCEPTION 'CHECKIN_PROGRESS_UNIT_REQUIRED';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.hotel_reservation_rooms
    WHERE id = NEW.reservation_room_id
      AND reservation_id = NEW.reservation_id
      AND restaurant_id = NEW.restaurant_id
  ) THEN
    RAISE EXCEPTION 'ROOM_UNIT_NOT_FOUND';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fo_checkin_progress_require_unit ON public.fo_checkin_progress;

CREATE TRIGGER fo_checkin_progress_require_unit
  BEFORE INSERT OR UPDATE OF reservation_room_id
  ON public.fo_checkin_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.fo_checkin_progress_require_unit();

REVOKE ALL ON FUNCTION public.fo_checkin_progress_require_unit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fo_checkin_progress_require_unit() TO authenticated, service_role;

COMMENT ON COLUMN public.fo_checkin_progress.reservation_room_id IS
  'Room unit this progress row belongs to. Null only when the reservation has no room units. Multi-unit legacy null rows are audit history, not live unit state.';
