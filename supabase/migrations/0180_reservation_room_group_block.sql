-- GB02: room-unit group block linkage for derived pickup.
-- Dual-lane: drizzle/migrations and supabase/migrations copies must match.
-- Sequential after 0179.
--
-- IN THE PR ONLY — do not apply from an agent.
-- Pickup stays derived from hotel_reservation_rooms (plus header fallback).
-- Header hotel_reservations.pms_group_id / pms_group_block_id remain the
-- default list/link columns.

ALTER TABLE public.hotel_reservation_rooms
  ADD COLUMN IF NOT EXISTS pms_group_block_id uuid;

ALTER TABLE public.hotel_reservation_rooms
  DROP CONSTRAINT IF EXISTS hotel_reservation_rooms_pms_group_block_same_property;
ALTER TABLE public.hotel_reservation_rooms
  ADD CONSTRAINT hotel_reservation_rooms_pms_group_block_same_property
  FOREIGN KEY (pms_group_block_id, restaurant_id)
  REFERENCES public.pms_group_blocks (id, restaurant_id);

CREATE INDEX IF NOT EXISTS hotel_reservation_rooms_pms_group_block_idx
  ON public.hotel_reservation_rooms (restaurant_id, pms_group_block_id)
  WHERE pms_group_block_id IS NOT NULL;

COMMENT ON COLUMN public.hotel_reservation_rooms.pms_group_block_id IS
  'Optional Groups & Blocks allotment consumed by this room unit. Pickup is derived; no pickup counter.';

UPDATE public.hotel_reservation_rooms AS unit
SET pms_group_block_id = stay.pms_group_block_id
FROM public.hotel_reservations AS stay
WHERE unit.reservation_id = stay.id
  AND unit.restaurant_id = stay.restaurant_id
  AND unit.pms_group_block_id IS NULL
  AND stay.pms_group_block_id IS NOT NULL;
