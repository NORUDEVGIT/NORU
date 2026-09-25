-- Phase 8A — stay-level expected arrival (ETA) and late checkout.
-- Dual-lane: drizzle/migrations and supabase/migrations copies must match.
-- Reservation-owned operational metadata on hotel_reservations.
-- No arrivals, departures, daily-control, exceptions, or bulk tables.

ALTER TABLE public.hotel_reservations
  ADD COLUMN IF NOT EXISTS expected_arrival_at timestamptz,
  ADD COLUMN IF NOT EXISTS late_checkout_granted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_checkout_until timestamptz,
  ADD COLUMN IF NOT EXISTS late_checkout_note text;

COMMENT ON COLUMN public.hotel_reservations.expected_arrival_at IS
  'Reservation-owned expected arrival instant. Nullable. Not property check-in time and not a Front Office check-in event.';

COMMENT ON COLUMN public.hotel_reservations.late_checkout_granted IS
  'Stay-level late checkout grant. Does not extend departure_date. Property SET1 late_checkout_allowed remains the policy gate.';

COMMENT ON COLUMN public.hotel_reservations.late_checkout_until IS
  'Approved same-day late checkout instant on the existing departure date. Null when not granted.';

COMMENT ON COLUMN public.hotel_reservations.late_checkout_note IS
  'Optional stay-level late checkout note. Cashiering remains owner of any fee posting.';
