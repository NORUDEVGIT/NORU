-- First Go-Live housekeeping room-state defaults.
-- New physical rooms (and inserts that omit housekeeping_status) start Clean.
-- Existing room rows are NOT rewritten. Checkout → Dirty transitions stay intact.
-- Card 2 settings seed default becomes Clean for brand-new properties only
-- (existing pms_housekeeping_settings rows are left unchanged).

ALTER TABLE public.hotel_rooms
  ALTER COLUMN housekeeping_status SET DEFAULT 'clean';

ALTER TABLE public.pms_housekeeping_settings
  ALTER COLUMN default_housekeeping_status SET DEFAULT 'clean';

COMMENT ON COLUMN public.hotel_rooms.housekeeping_status IS
  'Operational housekeeping cleanliness. New rooms default to clean; checkout workflow sets dirty. First Go-Live bootstrap only initializes untouched seed/default rows.';
