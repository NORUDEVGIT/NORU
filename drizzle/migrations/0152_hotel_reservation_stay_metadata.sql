-- Reservation metadata for arrival transport, a pickup note, and a special occasion.
--
-- These are columns on hotel_reservations. Pickup is a note, not a guest-service
-- request and not a service order. Occasion is edited from Requests & Preferences.
-- Flexible dates are not stored here.
--
-- Dual-lane: byte-identical copies.
-- Do not apply from an agent.

ALTER TABLE public.hotel_reservations
  ADD COLUMN IF NOT EXISTS arrival_transport text,
  ADD COLUMN IF NOT EXISTS pickup_note text,
  ADD COLUMN IF NOT EXISTS special_occasion text;

COMMENT ON COLUMN public.hotel_reservations.arrival_transport IS
  'Flight or other arrival transport text. Reservation metadata, not a service order.';

COMMENT ON COLUMN public.hotel_reservations.pickup_note IS
  'Pickup note stored on the reservation. Not a transport workflow, service request, or service order.';

COMMENT ON COLUMN public.hotel_reservations.special_occasion IS
  'Special occasion text. Edited from Requests and Preferences, not from a Stay-only list.';
